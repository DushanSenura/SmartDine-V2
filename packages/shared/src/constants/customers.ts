// ── Loyalty ───────────────────────────────────────────────────────

export const LOYALTY_TRANSACTION_TYPES = ["EARN", "REDEEM", "ADJUST", "REFUND"] as const;
export type LoyaltyTransactionType = (typeof LOYALTY_TRANSACTION_TYPES)[number];

export const LOYALTY_TRANSACTION_LABELS: Record<LoyaltyTransactionType, string> = {
  EARN: "Earned",
  REDEEM: "Redeemed",
  ADJUST: "Adjustment",
  REFUND: "Returned",
};

/** Points earned on a bill: whole points per `currencyPerPoint` spent, scaled by any multiplier. */
export function pointsForBill(total: number, currencyPerPoint: number, multiplier = 1): number {
  if (currencyPerPoint <= 0 || total <= 0) return 0;
  return Math.floor(Math.floor(total / currencyPerPoint) * Math.max(1, multiplier));
}

/** Money a number of points is worth, rounded to cents. */
export const pointsValue = (points: number, pointValue: number) =>
  Math.round(points * pointValue * 100) / 100;

/** The most points that can be redeemed against `balanceDue`: no more than held, none left over. */
export function maxRedeemablePoints(held: number, balanceDue: number, pointValue: number): number {
  if (pointValue <= 0 || balanceDue <= 0) return 0;
  return Math.max(0, Math.min(held, Math.floor(balanceDue / pointValue + 1e-9)));
}

// ── Promotions ────────────────────────────────────────────────────

export const PROMOTION_TYPES = [
  "PERCENTAGE",
  "FIXED",
  "HAPPY_HOUR",
  "LOYALTY_MULTIPLIER",
  "RESERVATION_OFFER",
  "ROOM_OFFER",
  "SEASONAL_OFFER",
] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  PERCENTAGE: "Percentage discount",
  FIXED: "Fixed discount",
  HAPPY_HOUR: "Happy hour",
  LOYALTY_MULTIPLIER: "Loyalty points multiplier",
  RESERVATION_OFFER: "Reservation offer",
  ROOM_OFFER: "Room offer",
  SEASONAL_OFFER: "Seasonal offer",
};

/** Types a cashier can apply to a bill. */
export const BILL_PROMOTION_TYPES = ["PERCENTAGE", "FIXED", "HAPPY_HOUR"] as const;
/** Types shown to guests on the Offers page rather than applied automatically. */
export const DISPLAY_PROMOTION_TYPES = [
  "RESERVATION_OFFER",
  "ROOM_OFFER",
  "SEASONAL_OFFER",
  "HAPPY_HOUR",
  "PERCENTAGE",
  "FIXED",
] as const;

export interface HappyHourWindow {
  /** ISO weekdays 1 (Mon) – 7 (Sun); empty = every day. */
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Is `weekday`/`time` (branch-local) inside the window? A window that runs past midnight
 * (22:00–02:00) belongs to the weekday it started on.
 */
export function inHappyHour(window: HappyHourWindow, weekday: number, time: string): boolean {
  const { daysOfWeek, startTime, endTime } = window;
  const now = minutes(time);
  if (!startTime || !endTime) return daysOfWeek.length === 0 || daysOfWeek.includes(weekday);
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start <= end) {
    return (daysOfWeek.length === 0 || daysOfWeek.includes(weekday)) && now >= start && now < end;
  }
  const yesterday = weekday === 1 ? 7 : weekday - 1;
  if (now >= start) return daysOfWeek.length === 0 || daysOfWeek.includes(weekday);
  if (now < end) return daysOfWeek.length === 0 || daysOfWeek.includes(yesterday);
  return false;
}

// ── Reviews ───────────────────────────────────────────────────────

export const REVIEW_KINDS = ["DINING", "STAY"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVIEW_STATUSES = ["PUBLISHED", "HIDDEN"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
