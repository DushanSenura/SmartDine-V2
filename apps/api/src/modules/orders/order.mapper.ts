import type { OrderDto, OrderHistoryDto, OrderItemDto } from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

export const orderInclude = {
  table: { select: { tableNumber: true } },
  room: { select: { roomNumber: true } },
  waiter: { select: { firstName: true, lastName: true } },
  branch: { select: { currency: true, timezone: true } },
  items: {
    include: { modifiers: true },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.OrderInclude;

export type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type OrderItemRecord = OrderRecord["items"][number];

export function toOrderItemDto(item: OrderItemRecord): OrderItemDto {
  const unitPrice = Number(item.unitPrice);
  return {
    id: item.id,
    menuItemId: item.menuItemId,
    name: item.name,
    quantity: item.quantity,
    unitPrice,
    lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
    notes: item.notes,
    status: item.status,
    station: item.station,
    modifiers: item.modifiers.map((m) => ({ name: m.name, priceDelta: Number(m.priceDelta) })),
    allergens: item.allergens,
    round: item.round,
  };
}

export function toOrderDto(
  order: OrderRecord,
  history?: Prisma.OrderHistoryGetPayload<{
    include: { user: { select: { firstName: true; lastName: true } } };
  }>[],
): OrderDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    branchId: order.branchId,
    type: order.type,
    status: order.status,
    tableId: order.tableId,
    tableNumber: order.table?.tableNumber ?? null,
    roomId: order.roomId,
    roomNumber: order.room?.roomNumber ?? null,
    guestName: order.guestName,
    guestCount: order.guestCount,
    waiterId: order.waiterId,
    waiterName: `${order.waiter.firstName} ${order.waiter.lastName}`,
    selfOrdered: order.placedByUserId !== null,
    kitchenInstructions: order.kitchenInstructions,
    subtotal: Number(order.subtotal),
    currency: order.branch.currency,
    items: order.items.map(toOrderItemDto),
    createdAt: order.createdAt.toISOString(),
    sentToKitchenAt: order.sentToKitchenAt?.toISOString() ?? null,
    servedAt: order.servedAt?.toISOString() ?? null,
    paymentRequestedAt: order.paymentRequestedAt?.toISOString() ?? null,
    ...(history && { history: history.map(toHistoryDto) }),
  };
}

function toHistoryDto(h: {
  id: string;
  fromStatus: OrderHistoryDto["fromStatus"];
  toStatus: OrderHistoryDto["toStatus"];
  note: string | null;
  createdAt: Date;
  user: { firstName: string; lastName: string } | null;
}): OrderHistoryDto {
  return {
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    note: h.note,
    userName: h.user ? `${h.user.firstName} ${h.user.lastName}` : null,
    createdAt: h.createdAt.toISOString(),
  };
}
