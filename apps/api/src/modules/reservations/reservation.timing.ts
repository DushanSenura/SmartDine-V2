import {
  DEFAULT_OPEN_HOURS,
  RESERVATION_RULES,
  WEEK_DAYS,
  type OpeningHours,
} from "@smartdine/shared";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export interface Window {
  start: Date;
  end: Date;
}

const MINUTE = 60_000;

/** Branch-local wall-clock date + time → UTC instant (DST-safe). */
export const localToUtc = (date: string, time: string, timezone: string): Date =>
  fromZonedTime(`${date}T${time}:00`, timezone);

/** UTC instant → branch-local `HH:mm`. */
export const utcToLocalTime = (instant: Date, timezone: string): string =>
  formatInTimeZone(instant, timezone, "HH:mm");

/** Day-of-week key of a calendar date (independent of timezone). */
export function weekDayOf(date: string): (typeof WEEK_DAYS)[number] {
  const sundayFirst = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return WEEK_DAYS[(sundayFirst + 6) % 7]!;
}

/**
 * Open window for a local calendar date, or null when closed that day.
 * A missing day falls back to the default hours; an explicit `null` means closed.
 * A close time at or before the open time means the venue closes after midnight.
 */
export function openWindow(
  hours: OpeningHours | null | undefined,
  date: string,
  timezone: string,
): Window | null {
  const entry = hours?.[weekDayOf(date)];
  if (entry === null) return null;
  const { open, close } = entry ?? DEFAULT_OPEN_HOURS;
  const start = localToUtc(date, open, timezone);
  let end = localToUtc(date, close, timezone);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * MINUTE);
  return { start, end };
}

/** Bookable start times: every `interval` minutes while the booking still ends by closing time. */
export function slotStarts(
  window: Window,
  durationMinutes: number,
  interval: number = RESERVATION_RULES.slotIntervalMinutes,
): Date[] {
  const latest = window.end.getTime() - durationMinutes * MINUTE;
  const starts: Date[] = [];
  for (let t = window.start.getTime(); t <= latest; t += interval * MINUTE) {
    starts.push(new Date(t));
  }
  return starts;
}

export const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * MINUTE);

/** Half-open interval overlap, matching the database's `[)` ranges. */
export const overlaps = (a: Window, b: Window) => a.start < b.end && b.start < a.end;

/** Reasons a start time cannot be booked, independent of table availability. */
export function bookingTimeProblem(start: Date, now = new Date()): string | null {
  if (start.getTime() < now.getTime() + RESERVATION_RULES.leadTimeMinutes * MINUTE) {
    return `Bookings must be made at least ${RESERVATION_RULES.leadTimeMinutes} minutes ahead.`;
  }
  if (start.getTime() > now.getTime() + RESERVATION_RULES.maxAdvanceDays * 24 * 60 * MINUTE) {
    return `Bookings can be made up to ${RESERVATION_RULES.maxAdvanceDays} days ahead.`;
  }
  return null;
}
