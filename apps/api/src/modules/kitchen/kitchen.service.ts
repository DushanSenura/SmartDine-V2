import {
  kitchenPriority,
  KITCHEN_PHASE_STATUSES,
  type KitchenStation,
  type KitchenTicketDto,
  type OrderItemStatus,
} from "@smartdine/shared";

import { prisma } from "../../config/database";
import { events } from "../notifications/notify.events";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { finishWrite, rederive, syncTable } from "../orders/order.service";

const WORKING_STATUSES = KITCHEN_PHASE_STATUSES.filter((s) => s !== "SERVED");

/** Which previous states each kitchen action may start from (so a stale screen cannot skip steps). */
const ALLOWED_FROM: Record<"PREPARING" | "PREPARED", OrderItemStatus[]> = {
  PREPARING: ["PENDING", "PREPARED"], // PREPARED → PREPARING is a recall
  PREPARED: ["PENDING", "PREPARING"],
};

const minutesSince = (date: Date, now: number) => Math.max(0, (now - date.getTime()) / 60_000);

export const kitchenService = {
  /**
   * Open tickets for a branch. The shape deliberately carries no prices or totals: the kitchen role
   * has no access to financial information.
   */
  async tickets(
    auth: AuthContext,
    query: { branchId?: string; station?: KitchenStation },
  ): Promise<KitchenTicketDto[]> {
    const branchId = requireBranch(auth, query.branchId);
    const orders = await prisma.order.findMany({
      where: { branchId, status: { in: [...WORKING_STATUSES] } },
      include: {
        table: { select: { tableNumber: true } },
        room: { select: { roomNumber: true } },
        waiter: { select: { firstName: true, lastName: true } },
        items: {
          where: {
            status: { in: ["PENDING", "PREPARING", "PREPARED"] },
            ...(query.station && { station: query.station }),
          },
          include: { modifiers: { select: { name: true } } },
          orderBy: [{ round: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { sentToKitchenAt: "asc" },
    });

    const now = Date.now();
    return orders
      .filter((o) => o.items.length > 0)
      .map((o) => {
        // Items added in a later round start their own clock when they were added.
        const sentFor = (round: number, createdAt: Date) =>
          round === 1 ? (o.sentToKitchenAt ?? createdAt) : createdAt;
        const unfinished = o.items.filter((i) => i.status !== "PREPARED");
        const clockStart = (unfinished.length ? unfinished : o.items)
          .map((i) => sentFor(i.round, i.createdAt))
          .reduce((a, b) => (a < b ? a : b));
        const elapsedMinutes = minutesSince(clockStart, now);
        return {
          orderId: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          type: o.type,
          location: o.table ? `Table ${o.table.tableNumber}` : `Room ${o.room?.roomNumber ?? "?"}`,
          waiterName: `${o.waiter.firstName} ${o.waiter.lastName}`,
          guestCount: o.guestCount,
          kitchenInstructions: o.kitchenInstructions,
          sentAt: clockStart.toISOString(),
          elapsedMinutes: Math.floor(elapsedMinutes),
          priority: unfinished.length ? kitchenPriority(elapsedMinutes) : "NORMAL",
          items: o.items.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            notes: i.notes,
            status: i.status,
            station: i.station,
            modifiers: i.modifiers.map((m) => m.name),
            allergens: i.allergens,
            round: i.round,
            startedAt: i.startedAt?.toISOString() ?? null,
            preparedAt: i.preparedAt?.toISOString() ?? null,
          })),
        };
      });
  },

  async setItemStatus(auth: AuthContext, itemId: string, status: "PREPARING" | "PREPARED") {
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });
    if (!item) throw AppError.notFound("Dish not found.");
    assertBranchAccess(auth, item.order.branchId);
    if (!(WORKING_STATUSES as readonly string[]).includes(item.order.status)) {
      throw AppError.conflict("INVALID_ORDER_STATE", "That order is not being prepared.");
    }
    if (!ALLOWED_FROM[status].includes(item.status)) {
      throw AppError.conflict(
        "INVALID_ITEM_STATE",
        `This dish is already ${item.status.toLowerCase()}.`,
      );
    }
    const touched = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.orderItem.updateMany({
        where: { id: itemId, status: item.status },
        data:
          status === "PREPARING"
            ? { status, startedAt: item.startedAt ?? now, preparedAt: null }
            : { status, startedAt: item.startedAt ?? now, preparedAt: now },
      });
      if (count === 0)
        throw AppError.conflict("INVALID_ITEM_STATE", "The dish was just updated. Please refresh.");
      await rederive(tx, item.orderId, auth.userId, `${item.name}: ${status.toLowerCase()}`);
      return syncTable(tx, item.order.tableId);
    });
    const written = await finishWrite(item.orderId, touched);
    if (status === "PREPARED") void events.dishesReady(written, [item.name], auth.userId);
  },

  /** Marks every unfinished dish (optionally only one station's) on a ticket as ready. */
  async markReady(auth: AuthContext, orderId: string, station?: KitchenStation) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw AppError.notFound("Order not found.");
    assertBranchAccess(auth, order.branchId);
    if (!(WORKING_STATUSES as readonly string[]).includes(order.status)) {
      throw AppError.conflict("INVALID_ORDER_STATE", "That order is not being prepared.");
    }
    const open = order.items.filter(
      (i) =>
        (i.status === "PENDING" || i.status === "PREPARING") && (!station || i.station === station),
    );
    if (open.length === 0)
      throw AppError.conflict("NOTHING_TO_PREPARE", "Every dish on this ticket is already ready.");
    const touched = await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.orderItem.updateMany({
        where: { id: { in: open.map((i) => i.id) }, status: { in: ["PENDING", "PREPARING"] } },
        data: { status: "PREPARED", preparedAt: now },
      });
      // Dishes marked ready straight from "waiting" still get a start time for timing reports.
      await tx.orderItem.updateMany({
        where: { id: { in: open.map((i) => i.id) }, startedAt: null },
        data: { startedAt: now },
      });
      await rederive(tx, orderId, auth.userId, `Kitchen marked ${open.length} dish(es) ready`);
      return syncTable(tx, order.tableId);
    });
    const written = await finishWrite(orderId, touched);
    void events.dishesReady(
      written,
      open.map((i) => i.name),
      auth.userId,
    );
  },
};
