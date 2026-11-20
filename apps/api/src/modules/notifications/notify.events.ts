import { prisma } from "../../config/database";

import { notify } from "./notification.service";

/** "3 Nov 2026, 7:00 pm" in the branch's own timezone. */
export async function describeWhen(branchId: string, date: Date) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { timezone: true },
  });
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: branch?.timezone ?? "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** The little an order needs to describe itself in a notification. */
interface OrderLike {
  id: string;
  branchId: string;
  orderNumber: string;
  waiterId: string;
  table: { tableNumber: string } | null;
  room: { roomNumber: string } | null;
}

const where = (o: OrderLike) =>
  o.table ? `Table ${o.table.tableNumber}` : `Room ${o.room?.roomNumber ?? ""}`.trim();

/** Domain events → who should hear about them. Each is fire-and-forget (see `notify`). */
export const events = {
  /**
   * A customer ordered from their table. The waiter they chose (or the one who got the table)
   * hears about it, and so does the cashier, who will be taking the payment. The kitchen is
   * notified separately by `orderSentToKitchen`.
   */
  tableOrderPlaced: (order: OrderLike, customerName: string, requestedWaiter: boolean) =>
    notify({
      type: "TABLE_ORDER_PLACED",
      title: `${where(order)}: new order from ${customerName}`,
      body: requestedWaiter
        ? `Order ${order.orderNumber}. The guest asked for you.`
        : `Order ${order.orderNumber}`,
      link: `/app/orders/${order.id}`,
      branchId: order.branchId,
      userIds: [order.waiterId],
      // With no waiter of their choice, managers hear about it too.
      roles: requestedWaiter ? ["CASHIER"] : ["CASHIER", "MANAGER"],
    }),

  orderAwaitingApproval: (order: OrderLike, actorId: string) =>
    notify({
      type: "ORDER_AWAITING_APPROVAL",
      title: `${where(order)} is waiting for approval`,
      body: `Order ${order.orderNumber}`,
      link: `/app/orders/${order.id}`,
      branchId: order.branchId,
      roles: ["WAITER", "MANAGER"],
      excludeUserId: actorId,
    }),

  orderSentToKitchen: (order: OrderLike, actorId: string, more: boolean) =>
    notify({
      type: more ? "ORDER_UPDATED" : "ORDER_SENT_TO_KITCHEN",
      title: more ? `More dishes for ${where(order)}` : `New order for ${where(order)}`,
      body: `Order ${order.orderNumber}`,
      link: "/app/kitchen",
      branchId: order.branchId,
      roles: ["KITCHEN"],
      excludeUserId: actorId,
    }),

  dishesReady: (order: OrderLike, dishes: string[], actorId: string) =>
    notify({
      type: "DISH_READY",
      title: `${where(order)}: ready to serve`,
      body: dishes.length === 1 ? dishes[0] : `${dishes.length} dishes are ready`,
      link: `/app/orders/${order.id}`,
      branchId: order.branchId,
      userIds: [order.waiterId],
      excludeUserId: actorId,
    }),

  billRequested: (order: OrderLike, actorId: string) =>
    notify({
      type: "BILL_REQUESTED",
      title: `${where(order)} asked for the bill`,
      body: `Order ${order.orderNumber}`,
      link: "/app/cashier",
      branchId: order.branchId,
      roles: ["CASHIER"],
      excludeUserId: actorId,
    }),

  paymentReceived: (bill: {
    customerId: string | null;
    branchId: string;
    billNumber: string;
    receiptId?: string | null;
  }) =>
    notify({
      type: "PAYMENT_RECEIVED",
      title: "Payment received — thank you",
      body: `Bill ${bill.billNumber}`,
      link: bill.receiptId ? `/account/invoices/${bill.receiptId}` : "/account/invoices",
      branchId: bill.branchId,
      userIds: [bill.customerId],
    }),

  reservationConfirmed: (r: {
    userId: string | null;
    branchId: string;
    reference: string;
    when: string;
  }) =>
    notify({
      type: "RESERVATION_CONFIRMED",
      title: "Your table is confirmed",
      body: `${r.when} · reference ${r.reference}`,
      link: "/account/reservations",
      branchId: r.branchId,
      userIds: [r.userId],
    }),

  reservationReminder: (r: {
    branchId: string;
    userId: string | null;
    reference: string;
    when: string;
  }) =>
    notify({
      type: "RESERVATION_REMINDER",
      title: "Your reservation is coming up",
      body: `${r.when} · reference ${r.reference}`,
      link: "/account/reservations",
      branchId: r.branchId,
      userIds: [r.userId],
    }),

  guestArrived: (r: { branchId: string; guestName: string; partySize: number }, actorId: string) =>
    notify({
      type: "RESERVATION_ARRIVED",
      title: `${r.guestName} has arrived`,
      body: `Party of ${r.partySize}`,
      link: "/app/reservations",
      branchId: r.branchId,
      roles: ["WAITER"],
      excludeUserId: actorId,
    }),

  reservationCancelled: (
    r: { branchId: string; guestName: string; reference: string; when: string },
    actorId: string | null,
  ) =>
    notify({
      type: "RESERVATION_CANCELLED",
      title: `Reservation cancelled: ${r.guestName}`,
      body: `${r.when} · ${r.reference}`,
      link: "/app/reservations",
      branchId: r.branchId,
      roles: ["MANAGER", "OWNER"],
      excludeUserId: actorId,
    }),

  roomBookingConfirmed: (b: {
    userId: string | null;
    branchId: string;
    reference: string;
    checkIn: string;
  }) =>
    notify({
      type: "ROOM_BOOKING_CONFIRMED",
      title: "Your room is booked",
      body: `Arriving ${b.checkIn} · reference ${b.reference}`,
      link: "/account/stays",
      branchId: b.branchId,
      userIds: [b.userId],
    }),

  roomMaintenance: (r: { branchId: string; roomNumber: string; status: string }, actorId: string) =>
    notify({
      type: "ROOM_MAINTENANCE",
      title: `Room ${r.roomNumber} is ${r.status.toLowerCase().replace("_", " ")}`,
      link: "/app/rooms",
      branchId: r.branchId,
      roles: ["MANAGER", "OWNER"],
      excludeUserId: actorId,
    }),

  lowStock: (
    i: { branchId: string; name: string; quantity: number; unit: string; outOfStock: boolean },
    actorId: string,
  ) =>
    notify({
      type: "LOW_STOCK",
      title: i.outOfStock ? `${i.name} is out of stock` : `${i.name} is running low`,
      body: `${i.quantity} ${i.unit} left`,
      link: "/app/inventory",
      branchId: i.branchId,
      roles: ["MANAGER", "OWNER"],
      excludeUserId: actorId,
    }),
};
