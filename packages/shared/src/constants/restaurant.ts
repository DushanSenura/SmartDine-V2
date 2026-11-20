export const BRANCH_STATUSES = ["OPEN", "CLOSED", "TEMPORARILY_CLOSED", "MAINTENANCE"] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

export const EMPLOYMENT_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const TABLE_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "OCCUPIED",
  "ORDERING",
  "WAITING_FOR_FOOD",
  "DINING",
  "PAYMENT_PENDING",
  "CLEANING",
  "OUT_OF_SERVICE",
] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_SHAPES = ["SQUARE", "RECTANGLE", "ROUND"] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Socket.IO event names shared by the API and the web client. */
export const SocketEvents = {
  TABLE_CREATED: "table:created",
  TABLE_UPDATED: "table:updated",
  TABLE_DELETED: "table:deleted",
  FLOOR_LAYOUT_CHANGED: "floor:layout-changed",
  /** Client → server: subscribe to / unsubscribe from a branch's live events. */
  BRANCH_JOIN: "branch:join",
  BRANCH_LEAVE: "branch:leave",
  MENU_ITEM_UPDATED: "menu:item-updated",
  RESERVATION_CHANGED: "reservation:changed",
  ORDER_CHANGED: "order:changed",
  PAYMENT_CHANGED: "payment:changed",
  NOTIFICATION_NEW: "notification:new",
  ROOM_UPDATED: "room:updated",
  ROOM_BOOKING_CHANGED: "room-booking:changed",
  SERVICE_REQUEST_CHANGED: "service-request:changed",
} as const;
