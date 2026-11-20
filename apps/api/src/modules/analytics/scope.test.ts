import { describe, expect, it } from "vitest";

import { addDays, eachDate, instants, isoWeekday, localDate, localHour } from "./scope";

describe("calendar helpers", () => {
  it("numbers weekdays Monday=1 … Sunday=7", () => {
    expect(isoWeekday("2026-11-02")).toBe(1); // Monday
    expect(isoWeekday("2026-11-08")).toBe(7); // Sunday
    expect(isoWeekday("2026-11-07")).toBe(6);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("lists every date in a range, inclusive", () => {
    expect(eachDate("2026-11-29", "2026-12-02")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(eachDate("2026-11-01", "2026-11-01")).toEqual(["2026-11-01"]);
    expect(eachDate("2026-11-02", "2026-11-01")).toEqual([]);
  });
});

describe("a branch's own day", () => {
  // 20:00 UTC on 3 Nov is already 01:30 on 4 Nov in Colombo (UTC+5:30).
  const evening = new Date("2026-11-03T20:00:00Z");

  it("puts an instant on the calendar day and hour of the branch, not of the server", () => {
    expect(localDate(evening, "UTC")).toBe("2026-11-03");
    expect(localDate(evening, "Asia/Colombo")).toBe("2026-11-04");
    expect(localHour(evening, "UTC")).toBe(20);
    expect(localHour(evening, "Asia/Colombo")).toBe(1);
  });

  it("follows daylight saving", () => {
    // London is UTC+1 in summer, UTC+0 in winter.
    expect(localHour(new Date("2026-07-01T23:30:00Z"), "Europe/London")).toBe(0);
    expect(localDate(new Date("2026-07-01T23:30:00Z"), "Europe/London")).toBe("2026-07-02");
    expect(localDate(new Date("2026-12-01T23:30:00Z"), "Europe/London")).toBe("2026-12-01");
  });

  it("turns a range of local dates into the instants that cover them", () => {
    const { start, end } = instants("2026-11-04", "2026-11-04", "Asia/Colombo");
    expect(start.toISOString()).toBe("2026-11-03T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-11-04T18:30:00.000Z");
    // Something at 01:30 local on the 4th is inside; one minute before midnight local on the 3rd is not.
    expect(evening >= start && evening < end).toBe(true);
    expect(new Date("2026-11-03T18:29:00Z") >= start).toBe(false);
  });
});
