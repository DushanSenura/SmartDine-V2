import { describe, expect, it } from "vitest";

import {
  addMinutes,
  bookingTimeProblem,
  localToUtc,
  openWindow,
  overlaps,
  slotStarts,
  utcToLocalTime,
  weekDayOf,
} from "./reservation.timing";

const TZ = "Asia/Colombo"; // UTC+05:30, no DST

describe("reservation timing", () => {
  it("converts branch-local times to UTC and back", () => {
    const utc = localToUtc("2026-12-01", "19:00", TZ);
    expect(utc.toISOString()).toBe("2026-12-01T13:30:00.000Z");
    expect(utcToLocalTime(utc, TZ)).toBe("19:00");
  });

  it("handles daylight saving transitions", () => {
    // New York: 2026-03-08 02:00 EST jumps to 03:00 EDT; 19:00 that evening is already EDT (UTC-4).
    expect(localToUtc("2026-03-08", "19:00", "America/New_York").toISOString()).toBe(
      "2026-03-08T23:00:00.000Z",
    );
    expect(localToUtc("2026-03-07", "19:00", "America/New_York").toISOString()).toBe(
      "2026-03-08T00:00:00.000Z",
    );
  });

  it("derives the weekday from the calendar date", () => {
    expect(weekDayOf("2026-12-01")).toBe("tue");
    expect(weekDayOf("2026-12-06")).toBe("sun");
  });

  it("uses configured hours, treats null as closed and a missing day as the default", () => {
    const hours = { tue: { open: "10:00", close: "20:00" }, wed: null };
    const tue = openWindow(hours, "2026-12-01", TZ)!;
    expect(utcToLocalTime(tue.start, TZ)).toBe("10:00");
    expect(utcToLocalTime(tue.end, TZ)).toBe("20:00");
    expect(openWindow(hours, "2026-12-02", TZ)).toBeNull();
    const thu = openWindow(hours, "2026-12-03", TZ)!;
    expect(utcToLocalTime(thu.start, TZ)).toBe("09:00");
    expect(openWindow(null, "2026-12-03", TZ)).not.toBeNull();
  });

  it("treats a close time before the open time as closing after midnight", () => {
    const window = openWindow({ fri: { open: "18:00", close: "02:00" } }, "2026-12-04", TZ)!;
    expect((window.end.getTime() - window.start.getTime()) / 3_600_000).toBe(8);
  });

  it("generates slots that still finish before closing", () => {
    const window = openWindow({ tue: { open: "10:00", close: "12:00" } }, "2026-12-01", TZ)!;
    const times = slotStarts(window, 90).map((s) => utcToLocalTime(s, TZ));
    expect(times).toEqual(["10:00", "10:30"]); // 10:30 + 90min = 12:00 (exactly closing)
  });

  it("uses half-open overlap so back-to-back bookings do not conflict", () => {
    const a = { start: new Date("2026-12-01T10:00:00Z"), end: new Date("2026-12-01T11:30:00Z") };
    const b = { start: a.end, end: addMinutes(a.end, 90) };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(a, { start: addMinutes(a.end, -1), end: b.end })).toBe(true);
  });

  it("enforces lead time and the advance-booking limit", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    expect(bookingTimeProblem(addMinutes(now, 10), now)).toMatch(/minutes ahead/);
    expect(bookingTimeProblem(addMinutes(now, 60), now)).toBeNull();
    expect(bookingTimeProblem(addMinutes(now, 60 * 24 * 120), now)).toMatch(/days ahead/);
  });
});
