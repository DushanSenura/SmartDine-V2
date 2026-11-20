// ── Notifications ─────────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
  "ORDER_AWAITING_APPROVAL",
  "ORDER_SENT_TO_KITCHEN",
  "ORDER_UPDATED",
  "DISH_READY",
  "BILL_REQUESTED",
  "RESERVATION_CONFIRMED",
  "RESERVATION_ARRIVED",
  "RESERVATION_CANCELLED",
  "ROOM_BOOKING_CONFIRMED",
  "ROOM_MAINTENANCE",
  "LOW_STOCK",
  "PAYMENT_RECEIVED",
  "SERVICE_REQUESTED",
  "TABLE_ORDER_PLACED",
  "RESERVATION_REMINDER",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Notifications are grouped under these headings in the bell. */
export const NOTIFICATION_GROUPS = [
  "Orders",
  "Kitchen",
  "Billing",
  "Bookings",
  "Stock & rooms",
] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const NOTIFICATION_GROUP_OF: Record<NotificationType, NotificationGroup> = {
  ORDER_AWAITING_APPROVAL: "Orders",
  ORDER_SENT_TO_KITCHEN: "Kitchen",
  ORDER_UPDATED: "Kitchen",
  DISH_READY: "Orders",
  BILL_REQUESTED: "Billing",
  PAYMENT_RECEIVED: "Billing",
  RESERVATION_CONFIRMED: "Bookings",
  RESERVATION_ARRIVED: "Bookings",
  RESERVATION_CANCELLED: "Bookings",
  ROOM_BOOKING_CONFIRMED: "Bookings",
  ROOM_MAINTENANCE: "Stock & rooms",
  LOW_STOCK: "Stock & rooms",
  SERVICE_REQUESTED: "Orders",
  TABLE_ORDER_PLACED: "Orders",
  RESERVATION_REMINDER: "Bookings",
};

// ── Audit ─────────────────────────────────────────────────────────

export const AUDIT_ENTITIES = [
  "menu_item",
  "staff",
  "branch",
  "order",
  "bill",
  "payment",
  "reservation",
  "room_booking",
  "settings",
  "promotion",
  "loyalty",
  "stock",
  "review",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

// ── Reports ───────────────────────────────────────────────────────

export const REPORT_TYPES = [
  "sales",
  "orders",
  "menu-performance",
  "employee-performance",
  "reservations",
  "room-occupancy",
  "room-revenue",
  "payments",
  "refunds",
  "inventory",
  "waste",
  "loyalty",
  "branch-performance",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<ReportType, string> = {
  sales: "Sales (daily, weekly, monthly)",
  orders: "Orders",
  "menu-performance": "Menu performance",
  "employee-performance": "Employee performance",
  reservations: "Reservations",
  "room-occupancy": "Room occupancy",
  "room-revenue": "Room revenue",
  payments: "Payments",
  refunds: "Refunds",
  inventory: "Inventory (current stock)",
  waste: "Waste",
  loyalty: "Loyalty",
  "branch-performance": "Branch performance",
};

/** Reports that compare branches only make sense company-wide, so only owners run them. */
export const OWNER_ONLY_REPORTS: readonly ReportType[] = ["branch-performance"];

export const REPORT_GROUPS = ["day", "week", "month"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export type ReportFormat = "text" | "money" | "number" | "percent" | "date" | "datetime";
