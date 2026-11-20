import {
  ACTIVE_ORDER_STATUSES,
  deriveOrderStatus,
  KITCHEN_PHASE_STATUSES,
  ORDER_RULES,
  Permissions,
  roleHasPermission,
  SocketEvents,
  type CreateOrderInput,
  type OrderLineInput,
  type OrderStatus,
  type TableOrderInput,
  type TableStatus,
  type UpdateOrderInput,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { events } from "../notifications/notify.events";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import { withResourceLock } from "../../utils/prisma";
import { currentMealPeriod } from "../menu/menu.mapper";
import { releasePromotion } from "../promotions/promotion.rules";
import { localToUtc } from "../reservations/reservation.timing";
import { tableInclude, toTableDto } from "../tables/table.mapper";
import { orderInclude, toOrderDto, type OrderRecord } from "./order.mapper";

type Tx = Prisma.TransactionClient;
const ACTIVE = [...ACTIVE_ORDER_STATUSES];
const KITCHEN_PHASE: readonly OrderStatus[] = KITCHEN_PHASE_STATUSES;

const isManager = (auth: AuthContext) => auth.role === "MANAGER" || auth.role === "OWNER";
const can = (auth: AuthContext, permission: Parameters<typeof roleHasPermission>[1]) =>
  roleHasPermission(auth.role, permission);

const wrongState = (action: string, status: OrderStatus) =>
  AppError.conflict(
    "INVALID_ORDER_STATE",
    `You can't ${action} an order that is ${status.toLowerCase().replaceAll("_", " ")}.`,
  );

async function record(
  tx: Tx,
  orderId: string,
  userId: string | null,
  from: OrderStatus | null,
  to: OrderStatus,
  note?: string | null,
) {
  await tx.orderHistory.create({
    data: { orderId, userId, fromStatus: from, toStatus: to, note: note ?? null },
  });
}

/** Latest dine-in table status implied by the table's open orders. */
function tableStatusFor(orders: { status: OrderStatus }[]): TableStatus | null {
  if (orders.some((o) => o.status === "PAYMENT_REQUESTED")) return "PAYMENT_PENDING";
  if (orders.some((o) => o.status === "PARTIALLY_SERVED" || o.status === "SERVED")) return "DINING";
  if (orders.some((o) => KITCHEN_PHASE.includes(o.status))) return "WAITING_FOR_FOOD";
  if (orders.some((o) => ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(o.status)))
    return "ORDERING";
  return null;
}

/**
 * Keeps the floor plan honest: the table shows what its open orders imply. Cleaning, reserved-only
 * and out-of-service tables are never overridden by an empty set of orders.
 */
async function syncTable(tx: Tx, tableId: string | null): Promise<string | null> {
  if (!tableId) return null;
  const table = await tx.restaurantTable.findUnique({ where: { id: tableId } });
  if (!table || table.status === "OUT_OF_SERVICE" || table.status === "CLEANING") return null;
  const orders = await tx.order.findMany({
    where: { tableId, status: { in: ACTIVE } },
    select: { status: true },
  });
  const implied = tableStatusFor(orders);
  // With no open orders, a table that was mid-service falls back to plain "occupied".
  const next: TableStatus | null =
    implied ??
    (["ORDERING", "WAITING_FOR_FOOD", "DINING", "PAYMENT_PENDING"].includes(table.status)
      ? "OCCUPIED"
      : null);
  if (!next || next === table.status) return null;
  await tx.restaurantTable.update({ where: { id: tableId }, data: { status: next } });
  return tableId;
}

async function publishTable(tableId: string | null) {
  if (!tableId) return;
  const table = await prisma.restaurantTable.findUnique({
    where: { id: tableId },
    include: tableInclude,
  });
  if (table) emitToBranch(table.branchId, SocketEvents.TABLE_UPDATED, toTableDto(table));
}

/** Once money has been taken the order is frozen: it can only be changed by refunding first. */
async function assertNoPayments(orderId: string) {
  if (await prisma.payment.count({ where: { bill: { orderId } } })) {
    throw AppError.conflict(
      "ORDER_HAS_PAYMENTS",
      "Payments were already taken on this order. Refund them first.",
    );
  }
}

async function loadOrder(auth: AuthContext, id: string): Promise<OrderRecord> {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw AppError.notFound("Order not found.");
  assertBranchAccess(auth, order.branchId);
  return order;
}

/** Notifications carry ids only; screens refetch through their own authorised endpoints. */
function announce(order: { id: string; branchId: string; status: OrderStatus }) {
  emitToBranch(order.branchId, SocketEvents.ORDER_CHANGED, {
    id: order.id,
    branchId: order.branchId,
    status: order.status,
  });
}

/** Validates ordered dishes against the live menu and snapshots their name, price and station. */
async function buildItems(
  tx: Tx,
  branch: { id: string; timezone: string },
  lines: OrderLineInput[],
  round: number,
) {
  const ids = [...new Set(lines.map((l) => l.menuItemId))];
  const menu = await tx.menuItem.findMany({
    where: { id: { in: ids }, branchId: branch.id, deletedAt: null, category: { isActive: true } },
    include: { modifiers: true, allergens: { select: { name: true } } },
  });
  const byId = new Map(menu.map((m) => [m.id, m]));
  const period = currentMealPeriod(branch.timezone);

  return lines.map((line) => {
    const dish = byId.get(line.menuItemId);
    if (!dish) throw AppError.validation("A dish on this order is not on this branch's menu.");
    if (
      dish.availability !== "AVAILABLE" ||
      (dish.mealPeriods.length > 0 && !dish.mealPeriods.includes(period))
    ) {
      throw AppError.conflict("ITEM_UNAVAILABLE", `${dish.name} is not available right now.`);
    }
    const chosen = line.modifierIds ?? [];
    const modifiers = chosen.map((id) => {
      const m = dish.modifiers.find((x) => x.id === id && x.isActive);
      if (!m) throw AppError.validation(`An option for ${dish.name} is not available.`);
      return m;
    });
    const unitPrice = Math.max(
      0,
      Number(dish.price) + modifiers.reduce((sum, m) => sum + Number(m.priceDelta), 0),
    );
    return {
      menuItemId: dish.id,
      name: dish.name,
      unitPrice,
      quantity: line.quantity ?? 1,
      notes: line.notes ?? null,
      station: dish.kitchenStation,
      allergens: dish.allergens.map((a) => a.name),
      preparationTime: dish.preparationTime,
      round,
      modifiers: { create: modifiers.map((m) => ({ name: m.name, priceDelta: m.priceDelta })) },
    };
  });
}

async function recomputeSubtotal(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({
    where: { orderId, status: { not: "CANCELLED" } },
    select: { unitPrice: true, quantity: true },
  });
  const subtotal = items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
  await tx.order.update({
    where: { id: orderId },
    data: { subtotal: Math.round(subtotal * 100) / 100 },
  });
}

/** Re-derives the status of an order in the kitchen phase from its items. */
async function rederive(tx: Tx, orderId: string, userId: string | null, note?: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { select: { status: true } } },
  });
  if (!KITCHEN_PHASE.includes(order.status)) return order.status;
  const next = deriveOrderStatus(order.items.map((i) => i.status));
  if (next === null) {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: note ?? "All items cancelled",
      },
    });
    await record(tx, orderId, userId, order.status, "CANCELLED", note ?? "All items cancelled");
    return "CANCELLED" as const;
  }
  if (next !== order.status) {
    await tx.order.update({
      where: { id: orderId },
      data: { status: next, ...(next === "SERVED" && { servedAt: new Date() }) },
    });
    await record(tx, orderId, userId, order.status, next, note);
  }
  return next;
}

async function finishWrite(orderId: string, touchedTable: string | null) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: orderInclude,
  });
  announce(order);
  await publishTable(touchedTable);
  return order;
}

async function nextOrderNumber(tx: Tx, branchId: string, timezone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const startOfDay = localToUtc(today, "00:00", timezone);
  const count = await tx.order.count({ where: { branchId, createdAt: { gte: startOfDay } } });
  return `${today.replaceAll("-", "")}-${String(count + 1).padStart(3, "0")}`;
}

/** The waiter who looks after a self-service order: the guest's pick, else the table's, else the quietest. */
async function resolveWaiter(
  branchId: string,
  table: { assignedWaiterId: string | null },
  requestedId: string | undefined,
): Promise<string> {
  const active = {
    branchId,
    deletedAt: null,
    status: "ACTIVE" as const,
    role: { name: "WAITER" as const },
  };
  if (requestedId) {
    const waiter = await prisma.user.findFirst({ where: { id: requestedId, ...active } });
    if (!waiter) throw AppError.validation("That waiter isn't available at this branch.");
    return waiter.id;
  }
  if (table.assignedWaiterId) {
    const assigned = await prisma.user.findFirst({
      where: { id: table.assignedWaiterId, ...active },
    });
    if (assigned) return assigned.id;
  }
  const waiters = await prisma.user.findMany({
    where: active,
    select: { id: true, _count: { select: { orders: { where: { status: { in: ACTIVE } } } } } },
  });
  if (waiters.length === 0)
    throw AppError.conflict(
      "NO_WAITER_AVAILABLE",
      "No waiter is on duty right now. Please ask a member of staff.",
    );
  waiters.sort((a, b) => a._count.orders - b._count.orders);
  return waiters[0]!.id;
}

export const orderService = {
  // ── Customer self-service ────────────────────────────────────────
  /** Waiters a guest may pick: active waiters of the branch. Names only. */
  async waiterOptions(branchId: string) {
    const waiters = await prisma.user.findMany({
      where: { branchId, deletedAt: null, status: "ACTIVE", role: { name: "WAITER" } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    });
    return waiters.map((w) => ({ id: w.id, name: `${w.firstName} ${w.lastName}` }));
  },

  /** Confirms a table number exists at the branch, so a typo is caught before ordering. */
  async lookupTable(branchId: string, tableNumber: string) {
    const table = await prisma.restaurantTable.findFirst({
      where: {
        branchId,
        deletedAt: null,
        tableNumber: { equals: tableNumber.trim(), mode: "insensitive" },
      },
      select: { tableNumber: true, section: true, assignedWaiterId: true, status: true },
    });
    if (!table || table.status === "OUT_OF_SERVICE")
      throw AppError.notFound(`We couldn't find table ${tableNumber.trim()} at this branch.`);
    return {
      tableNumber: table.tableNumber,
      section: table.section,
      assignedWaiterId: table.assignedWaiterId,
    };
  },

  /**
   * A signed-in customer orders from their table. The order goes straight to the kitchen, is owned
   * by the chosen (or assigned) waiter, and shows up for the cashier like any other table order.
   */
  async createForTable(auth: AuthContext, input: TableOrderInput) {
    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, deletedAt: null, status: "OPEN" },
    });
    if (!branch) throw AppError.notFound("This branch isn't taking orders right now.");
    const table = await prisma.restaurantTable.findFirst({
      where: {
        branchId: branch.id,
        deletedAt: null,
        tableNumber: { equals: input.tableNumber.trim(), mode: "insensitive" },
      },
    });
    if (!table)
      throw AppError.validation(`We couldn't find table ${input.tableNumber.trim()} here.`);
    if (table.status === "OUT_OF_SERVICE")
      throw AppError.conflict("TABLE_OUT_OF_SERVICE", "That table is out of service.");

    const customer = await prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { firstName: true, lastName: true },
    });
    const customerName = `${customer.firstName} ${customer.lastName}`.trim();
    const waiterId = await resolveWaiter(branch.id, table, input.waiterId);

    const created = await withResourceLock(branch.id, async (tx) => {
      const items = await buildItems(tx, branch, input.items, 1);
      const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      const order = await tx.order.create({
        data: {
          orderNumber: await nextOrderNumber(tx, branch.id, branch.timezone),
          branchId: branch.id,
          type: "DINE_IN",
          status: "SENT_TO_KITCHEN",
          sentToKitchenAt: new Date(),
          tableId: table.id,
          waiterId,
          placedByUserId: auth.userId,
          guestName: input.guestName ?? customerName,
          kitchenInstructions: input.kitchenInstructions ?? null,
          subtotal: Math.round(subtotal * 100) / 100,
          items: { create: items },
        },
      });
      await record(tx, order.id, auth.userId, null, "DRAFT", `Ordered by ${customerName}`);
      await record(tx, order.id, auth.userId, "DRAFT", "SENT_TO_KITCHEN", "Sent to the kitchen");
      return { id: order.id, tableId: await syncTable(tx, table.id) };
    });
    const written = await finishWrite(created.id, created.tableId);
    void events.tableOrderPlaced(written, customerName, !!input.waiterId);
    void events.orderSentToKitchen(written, auth.userId, false);
    return toOrderDto(written);
  },

  /** The customer's own orders from the last day, so they can follow progress. */
  async listMine(auth: AuthContext) {
    const orders = await prisma.order.findMany({
      where: {
        placedByUserId: auth.userId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return orders.map((o) => toOrderDto(o));
  },

  // ── Reading ──────────────────────────────────────────────────────
  async list(
    auth: AuthContext,
    query: {
      branchId?: string;
      scope: "active" | "history";
      status?: OrderStatus;
      tableId?: string;
    },
  ) {
    const branchId = requireBranch(auth, query.branchId);
    const orders = await prisma.order.findMany({
      where: {
        branchId,
        ...(query.tableId && { tableId: query.tableId }),
        ...(query.status
          ? { status: query.status }
          : { status: query.scope === "active" ? { in: ACTIVE } : { notIn: ACTIVE } }),
      },
      include: orderInclude,
      orderBy: { createdAt: query.scope === "active" ? "asc" : "desc" },
      take: query.scope === "active" ? 200 : 100,
    });
    return orders.map((o) => toOrderDto(o));
  },

  async get(auth: AuthContext, id: string) {
    const order = await loadOrder(auth, id);
    const history = await prisma.orderHistory.findMany({
      where: { orderId: id },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return toOrderDto(order, history);
  },

  // ── Creating & editing a draft ───────────────────────────────────
  async create(auth: AuthContext, input: CreateOrderInput) {
    const branchId = requireBranch(auth, input.branchId);
    const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
    if (!branch) throw AppError.notFound("Branch not found.");

    let roomBookingId: string | null = null;
    let guestName = input.guestName ?? null;
    if (input.type === "DINE_IN") {
      const table = await prisma.restaurantTable.findFirst({
        where: { id: input.tableId, branchId, deletedAt: null },
      });
      if (!table) throw AppError.validation("That table does not belong to this branch.");
      if (table.status === "OUT_OF_SERVICE")
        throw AppError.conflict("TABLE_OUT_OF_SERVICE", "That table is out of service.");
    } else {
      const stay = await prisma.roomBooking.findFirst({
        where: { roomId: input.roomId, branchId, bookingStatus: "CHECKED_IN" },
        include: { room: true },
      });
      if (!stay)
        throw AppError.conflict(
          "ROOM_NOT_OCCUPIED",
          "Room service is only available for rooms with a checked-in guest.",
        );
      roomBookingId = stay.id;
      guestName ??= stay.guestName;
    }

    const created = await withResourceLock(branchId, async (tx) => {
      const items = await buildItems(tx, branch, input.items, 1);
      const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      const order = await tx.order.create({
        data: {
          orderNumber: await nextOrderNumber(tx, branchId, branch.timezone),
          branchId,
          type: input.type,
          tableId: input.tableId,
          roomId: input.roomId,
          roomBookingId,
          waiterId: auth.userId,
          guestName,
          guestCount: input.guestCount ?? null,
          kitchenInstructions: input.kitchenInstructions ?? null,
          subtotal: Math.round(subtotal * 100) / 100,
          items: { create: items },
        },
      });
      await record(tx, order.id, auth.userId, null, "DRAFT", "Order created");
      return { id: order.id, tableId: await syncTable(tx, input.tableId ?? null) };
    });
    return toOrderDto(await finishWrite(created.id, created.tableId));
  },

  async update(auth: AuthContext, id: string, input: UpdateOrderInput) {
    const order = await loadOrder(auth, id);
    if (!["DRAFT", "PENDING_APPROVAL", ...KITCHEN_PHASE].includes(order.status))
      throw wrongState("edit", order.status);
    await prisma.order.update({
      where: { id },
      data: {
        guestName: input.guestName,
        guestCount: input.guestCount,
        kitchenInstructions: input.kitchenInstructions,
      },
    });
    return toOrderDto(await finishWrite(id, null));
  },

  /** Drafts take items freely; once the kitchen has the order, only approvers may add a new round. */
  async addItems(auth: AuthContext, id: string, lines: OrderLineInput[]) {
    const order = await loadOrder(auth, id);
    const inKitchen = KITCHEN_PHASE.includes(order.status);
    if (order.status !== "DRAFT" && !inKitchen) throw wrongState("add items to", order.status);
    await assertNoPayments(id);
    if (inKitchen && !can(auth, Permissions.ORDERS_APPROVE)) {
      throw AppError.forbidden(
        "Only staff who can approve orders may add dishes after it was sent to the kitchen.",
      );
    }
    if (
      order.items.filter((i) => i.status !== "CANCELLED").length + lines.length >
      ORDER_RULES.maxItemsPerOrder
    ) {
      throw AppError.validation(`An order can have at most ${ORDER_RULES.maxItemsPerOrder} items.`);
    }
    const touched = await prisma.$transaction(async (tx) => {
      const round = inKitchen ? Math.max(1, ...order.items.map((i) => i.round)) + 1 : 1;
      const items = await buildItems(
        tx,
        { id: order.branchId, timezone: order.branch.timezone },
        lines,
        round,
      );
      for (const item of items) await tx.orderItem.create({ data: { ...item, orderId: id } });
      await recomputeSubtotal(tx, id);
      if (inKitchen) {
        await rederive(tx, id, auth.userId, `Added ${lines.length} item(s) in round ${round}`);
        return syncTable(tx, order.tableId);
      }
      return null;
    });
    const written = await finishWrite(id, touched);
    if (inKitchen) void events.orderSentToKitchen(written, auth.userId, true);
    return toOrderDto(written);
  },

  async updateDraftItem(
    auth: AuthContext,
    id: string,
    itemId: string,
    input: { quantity?: number; notes?: string | null },
  ) {
    const order = await loadOrder(auth, id);
    if (order.status !== "DRAFT") throw wrongState("edit items on", order.status);
    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw AppError.notFound("Item not found on this order.");
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: itemId },
        data: { quantity: input.quantity, notes: input.notes },
      });
      await recomputeSubtotal(tx, id);
    });
    return toOrderDto(await finishWrite(id, null));
  },

  async removeDraftItem(auth: AuthContext, id: string, itemId: string) {
    const order = await loadOrder(auth, id);
    if (order.status !== "DRAFT") throw wrongState("remove items from", order.status);
    if (!order.items.some((i) => i.id === itemId))
      throw AppError.notFound("Item not found on this order.");
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: itemId } });
      await recomputeSubtotal(tx, id);
    });
    return toOrderDto(await finishWrite(id, null));
  },

  // ── Approval workflow ────────────────────────────────────────────
  async submit(auth: AuthContext, id: string) {
    const order = await loadOrder(auth, id);
    if (order.status !== "DRAFT") throw wrongState("submit", order.status);
    if (!order.items.some((i) => i.status !== "CANCELLED"))
      throw AppError.validation("Add at least one dish before submitting.");
    const { count } = await prisma.order.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "PENDING_APPROVAL" },
    });
    if (count === 0) throw wrongState("submit", order.status);
    await prisma.orderHistory.create({
      data: { orderId: id, userId: auth.userId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL" },
    });
    const written = await finishWrite(
      id,
      await prisma.$transaction((tx) => syncTable(tx, order.tableId)),
    );
    void events.orderAwaitingApproval(written, auth.userId);
    return toOrderDto(written);
  },

  /** Approving sends the order to the kitchen. Approvers can also send a draft directly. */
  async approve(auth: AuthContext, id: string) {
    const order = await loadOrder(auth, id);
    if (order.status !== "PENDING_APPROVAL" && order.status !== "DRAFT")
      throw wrongState("approve", order.status);
    if (!order.items.some((i) => i.status !== "CANCELLED"))
      throw AppError.validation("The order has no dishes.");
    const touched = await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, status: order.status },
        data: { status: "SENT_TO_KITCHEN", sentToKitchenAt: new Date() },
      });
      if (count === 0) throw wrongState("approve", order.status);
      if (order.status === "DRAFT")
        await record(tx, id, auth.userId, "DRAFT", "PENDING_APPROVAL", "Submitted");
      await record(
        tx,
        id,
        auth.userId,
        order.status === "DRAFT" ? "PENDING_APPROVAL" : order.status,
        "APPROVED",
        "Approved",
      );
      await record(tx, id, auth.userId, "APPROVED", "SENT_TO_KITCHEN", "Sent to the kitchen");
      return syncTable(tx, order.tableId);
    });
    const written = await finishWrite(id, touched);
    void events.orderSentToKitchen(written, auth.userId, false);
    return toOrderDto(written);
  },

  async reject(auth: AuthContext, id: string, reason?: string | null) {
    const order = await loadOrder(auth, id);
    if (order.status !== "PENDING_APPROVAL") throw wrongState("reject", order.status);
    const { count } = await prisma.order.updateMany({
      where: { id, status: "PENDING_APPROVAL" },
      data: { status: "DRAFT" },
    });
    if (count === 0) throw wrongState("reject", order.status);
    await prisma.orderHistory.create({
      data: {
        orderId: id,
        userId: auth.userId,
        fromStatus: "PENDING_APPROVAL",
        toStatus: "DRAFT",
        note: reason ?? "Returned for changes",
      },
    });
    return toOrderDto(await finishWrite(id, null));
  },

  /**
   * Cancelling before the kitchen starts is open to order takers. Once any dish is being prepared
   * or served, only a manager can void the order.
   */
  async cancel(auth: AuthContext, id: string, reason?: string | null) {
    const order = await loadOrder(auth, id);
    if (!(ACTIVE as OrderStatus[]).includes(order.status)) throw wrongState("cancel", order.status);
    await assertNoPayments(id);
    const started = order.items.some((i) => ["PREPARING", "PREPARED", "SERVED"].includes(i.status));
    const afterBilling = order.status === "PAYMENT_REQUESTED";
    if ((started || afterBilling) && !isManager(auth)) {
      throw AppError.forbidden("This order is already in progress. Ask a manager to void it.");
    }
    const target: OrderStatus = started || afterBilling ? "VOID" : "CANCELLED";
    const touched = await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, status: order.status },
        data: { status: target, cancelledAt: new Date(), cancelReason: reason ?? null },
      });
      if (count === 0) throw wrongState("cancel", order.status);
      await tx.orderItem.updateMany({
        where: { orderId: id, status: { not: "CANCELLED" } },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: reason ?? "Order cancelled",
        },
      });
      await record(tx, id, auth.userId, order.status, target, reason ?? null);
      // An unpaid bill for a voided order is void with it.
      const openBill = await tx.bill.findFirst({ where: { orderId: id, status: "OPEN" } });
      if (openBill) {
        // A promo code held by the bill gives its use back.
        await releasePromotion(tx, openBill.id);
        await tx.bill.update({ where: { id: openBill.id }, data: { status: "VOID" } });
      }
      return syncTable(tx, order.tableId);
    });
    const written = await finishWrite(id, touched);
    // Voiding work that was already under way is the sensitive case worth an audit entry.
    if (target === "VOID") {
      void audit(auth, {
        action: "order.voided",
        entity: "order",
        entityId: id,
        branchId: order.branchId,
        previousValue: { status: order.status },
        newValue: { status: target, reason: reason ?? null },
      });
    }
    return toOrderDto(written);
  },

  // ── Items after the order is in the kitchen ──────────────────────
  async cancelItem(auth: AuthContext, id: string, itemId: string, reason?: string | null) {
    const order = await loadOrder(auth, id);
    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw AppError.notFound("Item not found on this order.");
    await assertNoPayments(id);
    if (order.status === "DRAFT") return orderService.removeDraftItem(auth, id, itemId);
    if (!KITCHEN_PHASE.includes(order.status) && order.status !== "PENDING_APPROVAL")
      throw wrongState("cancel items on", order.status);
    if (item.status === "CANCELLED" || item.status === "SERVED")
      throw AppError.conflict("ITEM_NOT_CANCELLABLE", "This dish can no longer be cancelled.");
    if (item.status !== "PENDING" && !isManager(auth)) {
      throw AppError.forbidden(
        "The kitchen has already started this dish. Ask a manager to cancel it.",
      );
    }
    const touched = await prisma.$transaction(async (tx) => {
      const { count } = await tx.orderItem.updateMany({
        where: { id: itemId, status: item.status },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? null },
      });
      if (count === 0)
        throw AppError.conflict(
          "ITEM_NOT_CANCELLABLE",
          "The dish just changed state. Please refresh.",
        );
      await recomputeSubtotal(tx, id);
      await rederive(tx, id, auth.userId, `Cancelled ${item.name}${reason ? `: ${reason}` : ""}`);
      return syncTable(tx, order.tableId);
    });
    return toOrderDto(await finishWrite(id, touched));
  },

  async serveItems(auth: AuthContext, id: string, itemIds?: string[]) {
    const order = await loadOrder(auth, id);
    if (!KITCHEN_PHASE.includes(order.status)) throw wrongState("serve", order.status);
    const ready = order.items.filter(
      (i) => i.status === "PREPARED" && (!itemIds || itemIds.includes(i.id)),
    );
    if (ready.length === 0)
      throw AppError.conflict("NOTHING_TO_SERVE", "No dishes are ready to serve.");
    const touched = await prisma.$transaction(async (tx) => {
      const { count } = await tx.orderItem.updateMany({
        where: { id: { in: ready.map((i) => i.id) }, status: "PREPARED" },
        data: { status: "SERVED", servedAt: new Date() },
      });
      if (count === 0)
        throw AppError.conflict("NOTHING_TO_SERVE", "Those dishes were just served.");
      await rederive(tx, id, auth.userId, `Served ${ready.map((i) => i.name).join(", ")}`);
      return syncTable(tx, order.tableId);
    });
    return toOrderDto(await finishWrite(id, touched));
  },

  async requestPayment(auth: AuthContext, id: string) {
    const order = await loadOrder(auth, id);
    if (order.status !== "SERVED") {
      throw AppError.conflict("NOT_ALL_SERVED", "Serve every dish before requesting the bill.");
    }
    const touched = await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, status: "SERVED" },
        data: { status: "PAYMENT_REQUESTED", paymentRequestedAt: new Date() },
      });
      if (count === 0) throw wrongState("request payment for", order.status);
      await record(tx, id, auth.userId, "SERVED", "PAYMENT_REQUESTED", "Bill requested");
      return syncTable(tx, order.tableId);
    });
    const written = await finishWrite(id, touched);
    void events.billRequested(written, auth.userId);
    return toOrderDto(written);
  },
};

export { announce, publishTable, record, finishWrite, rederive, syncTable };
