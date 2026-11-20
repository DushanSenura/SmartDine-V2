export const ROOM_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "OCCUPIED",
  "CLEANING",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** Statuses an operator may set by hand. The rest are driven by bookings and housekeeping. */
export const MANUAL_ROOM_STATUSES = ["AVAILABLE", "MAINTENANCE", "OUT_OF_SERVICE"] as const;

export const HOUSEKEEPING_STATUSES = [
  "CLEAN",
  "DIRTY",
  "CLEANING",
  "INSPECTION",
  "MAINTENANCE",
] as const;
export type HousekeepingStatus = (typeof HOUSEKEEPING_STATUSES)[number];

export const HOUSEKEEPING_TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE"] as const;
export type HousekeepingTaskStatus = (typeof HOUSEKEEPING_TASK_STATUSES)[number];

export const BED_TYPES = ["SINGLE", "TWIN", "DOUBLE", "QUEEN", "KING"] as const;
export type BedType = (typeof BED_TYPES)[number];

export const ROOM_TYPE_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const ROOM_AMENITIES = [
  "Wi-Fi",
  "Air conditioning",
  "Smart TV",
  "Mini bar",
  "Room service",
  "Breakfast",
  "Balcony",
  "City view",
  "Sea view",
  "Bathtub",
  "Workspace",
  "Safe",
  "Parking",
] as const;

export const EXTRA_PRICING_MODES = ["PER_STAY", "PER_NIGHT", "PER_GUEST"] as const;
export type ExtraPricingMode = (typeof EXTRA_PRICING_MODES)[number];

export const ROOM_BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type RoomBookingStatus = (typeof ROOM_BOOKING_STATUSES)[number];

/** Statuses that hold a room. Must match the exclusion constraint in the database. */
export const ACTIVE_ROOM_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN"] as const;

export const ROOM_BOOKING_TRANSITIONS: Record<RoomBookingStatus, readonly RoomBookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["CHECKED_OUT"],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const ROOM_PAYMENT_STATUSES = ["UNPAID", "DEPOSIT_PAID", "PAID", "REFUNDED"] as const;
export type RoomPaymentStatus = (typeof ROOM_PAYMENT_STATUSES)[number];

export const ROOM_RULES = {
  maxNights: 30,
  maxAdvanceDays: 365,
  maxGuestsPerBooking: 12,
  maxUpcomingPerCustomer: 5,
} as const;

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  OCCUPIED: "Occupied",
  CLEANING: "Cleaning",
  MAINTENANCE: "Maintenance",
  OUT_OF_SERVICE: "Out of service",
};

export const HOUSEKEEPING_LABELS: Record<HousekeepingStatus, string> = {
  CLEAN: "Clean",
  DIRTY: "Dirty",
  CLEANING: "Cleaning",
  INSPECTION: "Inspection",
  MAINTENANCE: "Maintenance",
};

export const ROOM_BOOKING_STATUS_LABELS: Record<RoomBookingStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};
