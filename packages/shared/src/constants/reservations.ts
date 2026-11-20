export const RESERVATION_TYPES = ["TABLE", "PRIVATE_DINING"] as const;
export type ReservationType = (typeof RESERVATION_TYPES)[number];

export const RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses that hold a table / room. Must match the exclusion constraint in the database. */
export const ACTIVE_RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "SEATED",
] as const;

/** Allowed staff transitions. Anything not listed is terminal. */
export const RESERVATION_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const OCCASIONS = [
  "BIRTHDAY",
  "MEETING",
  "FAMILY_DINNER",
  "BUSINESS_DINNER",
  "CELEBRATION",
  "PRIVATE_EVENT",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const OCCASION_LABELS: Record<Occasion, string> = {
  BIRTHDAY: "Birthday",
  MEETING: "Meeting",
  FAMILY_DINNER: "Family dinner",
  BUSINESS_DINNER: "Business dinner",
  CELEBRATION: "Celebration",
  PRIVATE_EVENT: "Private event",
};

export const RESERVATION_RULES = {
  maxGuests: 50,
  /** Slots are offered on this interval, in minutes. */
  slotIntervalMinutes: 30,
  /** Earliest bookable start, from now. */
  leadTimeMinutes: 30,
  maxAdvanceDays: 90,
  /** Upcoming active reservations a customer may hold at once (abuse protection). */
  maxUpcomingPerCustomer: 5,
  privateMinMinutes: 60,
  privateMaxMinutes: 720,
} as const;

/** Used when a branch / room has no opening hours configured for a day. */
export const DEFAULT_OPEN_HOURS = { open: "09:00", close: "22:00" } as const;

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  SEATED: "Seated",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};
