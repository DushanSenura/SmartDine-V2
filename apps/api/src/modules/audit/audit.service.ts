import type { AuditEntryDto } from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { escapeLike } from "../../utils/prisma";
import { logger } from "../../config/logger";
import { currentRequest } from "../../middleware/requestContext";
import { localToUtc } from "../reservations/reservation.timing";
import type { AuthContext } from "../../types/express";

const PAGE_SIZE = 50;

export interface AuditInput {
  /** Dotted verb, e.g. "payment.refunded". */
  action: string;
  entity: string;
  entityId?: string | null;
  branchId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}

/** The fields of `after` that differ from `before`, as two small objects (never whole records). */
export function changes<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: (keyof T)[],
): { previousValue: Partial<T>; newValue: Partial<T> } | null {
  const previousValue: Partial<T> = {};
  const newValue: Partial<T> = {};
  for (const key of keys) {
    if (after[key] === undefined) continue;
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) {
      previousValue[key] = before[key];
      newValue[key] = after[key];
    }
  }
  return Object.keys(newValue).length > 0 ? { previousValue, newValue } : null;
}

const json = (value: unknown): Prisma.InputJsonValue | undefined =>
  value === undefined || value === null
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

/**
 * Records a sensitive action with who did it, what changed and from where. Pass `tx` to write it in
 * the same transaction as the change (so they commit together); otherwise it is written straight
 * after, and a failure is logged rather than undoing a change that already happened.
 */
export async function audit(
  actor: AuthContext | null,
  entry: AuditInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const write = async (db: Prisma.TransactionClient | typeof prisma) => {
    const user = actor
      ? await db.user.findUnique({
          where: { id: actor.userId },
          select: { firstName: true, lastName: true },
        })
      : null;
    await db.auditLog.create({
      data: {
        userId: actor?.userId ?? null,
        userName: user ? `${user.firstName} ${user.lastName}` : null,
        role: actor?.role ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        branchId: entry.branchId ?? actor?.branchId ?? null,
        previousValue: json(entry.previousValue),
        newValue: json(entry.newValue),
        ip: currentRequest()?.ip ?? null,
      },
    });
  };
  if (tx) return write(tx);
  try {
    await write(prisma);
  } catch (error) {
    logger.error({ err: error, action: entry.action }, "Failed to write audit entry");
  }
}

export const auditService = {
  async list(query: {
    from?: string;
    to?: string;
    entity?: string;
    action?: string;
    userId?: string;
    page: number;
  }) {
    const company = await prisma.company.findFirst({ where: { deletedAt: null } });
    const tz = company?.timezone ?? "UTC";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity && { entity: query.entity }),
      ...(query.action && { action: { contains: escapeLike(query.action), mode: "insensitive" } }),
      ...(query.userId && { userId: query.userId }),
      ...((query.from || query.to) && {
        createdAt: {
          gte: localToUtc(query.from ?? query.to!, "00:00", tz),
          lt: new Date(localToUtc(query.to ?? today, "00:00", tz).getTime() + 24 * 3_600_000),
        },
      }),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.auditLog.count({ where }),
    ]);
    const entries: AuditEntryDto[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      role: r.role,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      branchId: r.branchId,
      previousValue: r.previousValue,
      newValue: r.newValue,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));
    return { entries, meta: { total, page: query.page, pageSize: PAGE_SIZE } };
  },
};
