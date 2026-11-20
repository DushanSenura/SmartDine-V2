export const ORDER_TYPES = ["DINE_IN", "ROOM_SERVICE"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT_TO_KITCHEN",
  "PREPARING",
  "PARTIALLY_READY",
  "READY_TO_SERVE",
  "PARTIALLY_SERVED",
  "SERVED",
  "PAYMENT_REQUESTED",
  "PAID",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
  "VOID",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_ITEM_STATUSES = [
  "PENDING",
  "PREPARING",
  "PREPARED",
  "SERVED",
  "CANCELLED",
] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

/** Statuses an order is "open" in: it still holds a table / is being worked on. */
export const ACTIVE_ORDER_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT_TO_KITCHEN",
  "PREPARING",
  "PARTIALLY_READY",
  "READY_TO_SERVE",
  "PARTIALLY_SERVED",
  "SERVED",
  "PAYMENT_REQUESTED",
] as const satisfies readonly OrderStatus[];

/** Statuses during which the kitchen works on the order and its status follows its items. */
export const KITCHEN_PHASE_STATUSES = [
  "SENT_TO_KITCHEN",
  "PREPARING",
  "PARTIALLY_READY",
  "READY_TO_SERVE",
  "PARTIALLY_SERVED",
  "SERVED",
] as const satisfies readonly OrderStatus[];

export const ORDER_RULES = {
  maxItemsPerOrder: 60,
  maxQuantityPerItem: 50,
} as const;

/** Kitchen ticket urgency by minutes since the order was sent. */
export const KITCHEN_PRIORITY_THRESHOLDS = { attentionMinutes: 10, urgentMinutes: 20 } as const;
export type KitchenPriority = "NORMAL" | "ATTENTION" | "URGENT";

export function kitchenPriority(elapsedMinutes: number): KitchenPriority {
  if (elapsedMinutes >= KITCHEN_PRIORITY_THRESHOLDS.urgentMinutes) return "URGENT";
  if (elapsedMinutes >= KITCHEN_PRIORITY_THRESHOLDS.attentionMinutes) return "ATTENTION";
  return "NORMAL";
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  SENT_TO_KITCHEN: "Sent to kitchen",
  PREPARING: "Preparing",
  PARTIALLY_READY: "Partly ready",
  READY_TO_SERVE: "Ready to serve",
  PARTIALLY_SERVED: "Partly served",
  SERVED: "Served",
  PAYMENT_REQUESTED: "Bill requested",
  PAID: "Paid",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  VOID: "Void",
};

export const ORDER_ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  PENDING: "Waiting",
  PREPARING: "Preparing",
  PREPARED: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABELS: Record<KitchenPriority, string> = {
  NORMAL: "On time",
  ATTENTION: "Attention",
  URGENT: "Urgent",
};

/**
 * An order's status while it is in the kitchen phase, derived from its (non-cancelled) items.
 * Returns null when every item is cancelled (the order itself should then be cancelled).
 */
export function deriveOrderStatus(items: readonly OrderItemStatus[]): OrderStatus | null {
  const live = items.filter((s) => s !== "CANCELLED");
  if (live.length === 0) return null;
  const served = live.filter((s) => s === "SERVED").length;
  if (served === live.length) return "SERVED";
  if (served > 0) return "PARTIALLY_SERVED";
  const prepared = live.filter((s) => s === "PREPARED").length;
  if (prepared === live.length) return "READY_TO_SERVE";
  if (prepared > 0) return "PARTIALLY_READY";
  if (live.some((s) => s === "PREPARING")) return "PREPARING";
  return "SENT_TO_KITCHEN";
}
