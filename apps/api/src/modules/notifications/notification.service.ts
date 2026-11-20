import {
  SocketEvents,
  type NotificationDto,
  type NotificationListDto,
  type NotificationType,
  type Role,
} from "@smartdine/shared";

import { prisma } from "../../config/database";
import { logger } from "../../config/logger";
import { AppError } from "../../shared/errors/AppError";
import { emitToUser } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  /** In-app path the notification opens. */
  link?: string | null;
  /** Staff of this branch (owners are matched by role, wherever they are). */
  branchId?: string | null;
  roles?: Role[];
  /** Specific recipients, e.g. the waiter who owns an order or the customer who booked. */
  userIds?: (string | null | undefined)[];
  /** The person who caused the event doesn't need telling about it. */
  excludeUserId?: string | null;
}

const toDto = (n: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto => ({
  id: n.id,
  type: n.type as NotificationType,
  title: n.title,
  body: n.body,
  link: n.link,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

/**
 * Tells the right people about something that happened, in the app and live over the socket.
 * Notifications are a convenience, never the system of record: a failure here is logged and
 * never undoes or delays the action that triggered it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const recipients = new Set<string>((input.userIds ?? []).filter((id): id is string => !!id));
    if (input.roles && input.roles.length > 0) {
      const users = await prisma.user.findMany({
        where: {
          deletedAt: null,
          status: "ACTIVE",
          role: { name: { in: input.roles } },
          // Owners work across branches; everyone else is limited to the branch of the event.
          OR: [
            { role: { name: "OWNER" } },
            ...(input.branchId ? [{ branchId: input.branchId }] : []),
          ],
        },
        select: { id: true },
      });
      for (const u of users) recipients.add(u.id);
    }
    if (input.excludeUserId) recipients.delete(input.excludeUserId);
    if (recipients.size === 0) return;

    const rows = await prisma.notification.createManyAndReturn({
      data: [...recipients].map((userId) => ({
        userId,
        branchId: input.branchId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      })),
    });
    for (const row of rows) emitToUser(row.userId, SocketEvents.NOTIFICATION_NEW, toDto(row));
  } catch (error) {
    logger.error({ err: error, type: input.type }, "Failed to send notification");
  }
}

export const notificationService = {
  async list(
    auth: AuthContext,
    query: { unread?: "true" | "false"; limit: number },
  ): Promise<NotificationListDto> {
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: auth.userId, ...(query.unread === "true" && { readAt: null }) },
        orderBy: { createdAt: "desc" },
        take: query.limit,
      }),
      prisma.notification.count({ where: { userId: auth.userId, readAt: null } }),
    ]);
    return { unreadCount, notifications: rows.map(toDto) };
  },

  /** Only ever your own: someone else's id is "not found", not "forbidden". */
  async markRead(auth: AuthContext, id: string) {
    const { count } = await prisma.notification.updateMany({
      where: { id, userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await prisma.notification.count({ where: { id, userId: auth.userId } });
      if (!exists) throw AppError.notFound("Notification not found.");
    }
  },

  async markAllRead(auth: AuthContext) {
    const { count } = await prisma.notification.updateMany({
      where: { userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: count };
  },
};
