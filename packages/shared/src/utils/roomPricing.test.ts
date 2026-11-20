import { describe, expect, it } from "vitest";

import {
  buildQuote,
  extraTotal,
  isWeekendNight,
  nightlyRates,
  nightsBetween,
  roomStatusAfterHousekeeping,
  round2,
  stayNights,
} from "./roomPricing";

describe("stay dates", () => {
  it("counts nights between dates, including across months and years", () => {
    expect(nightsBetween("2026-12-01", "2026-12-04")).toBe(3);
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(nightsBetween("2028-02-28", "2028-03-01")).toBe(2); // leap year
  });

  it("lists each night of the stay, excluding the checkout date", () => {
    expect(stayNights("2026-12-30", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });
});

describe("nightly pricing", () => {
  it("charges Friday and Saturday nights at the weekend rate", () => {
    // 2026-12-03 is a Thursday.
    const nights = stayNights("2026-12-03", 4); // Thu, Fri, Sat, Sun
    expect(nights.map(isWeekendNight)).toEqual([false, true, true, false]);
    expect(nightlyRates(100, 150, nights).map((n) => n.price)).toEqual([100, 150, 150, 100]);
  });

  it("falls back to the base price when there is no weekend price", () => {
    expect(nightlyRates(100, null, stayNights("2026-12-04", 2)).map((n) => n.price)).toEqual([
      100, 100,
    ]);
  });
});

describe("quotes", () => {
  it("adds extras, applies tax to the taxable amount and derives the deposit", () => {
    const quote = buildQuote({
      nightly: nightlyRates(10000, 12000, stayNights("2026-12-04", 2)), // Fri + Sat = 24,000
      extrasTotal: 3000,
      taxRatePercent: 10,
      depositPercent: 20,
      currency: "LKR",
    });
    expect(quote).toMatchObject({
      nights: 2,
      roomSubtotal: 24000,
      extrasTotal: 3000,
      taxes: 2700,
      total: 29700,
      deposit: 5940,
    });
  });

  it("never produces fractional cents or a negative total", () => {
    const quote = buildQuote({
      nightly: [{ date: "2026-12-01", price: 99.99 }],
      taxRatePercent: 8.5,
      depositPercent: 33.33,
      discount: 1000,
      currency: "LKR",
    });
    expect(quote.total).toBe(0);
    const normal = buildQuote({
      nightly: [{ date: "2026-12-01", price: 99.99 }],
      taxRatePercent: 8.5,
      depositPercent: 33.33,
      currency: "LKR",
    });
    expect(normal.taxes).toBe(8.5);
    expect(normal.total).toBe(round2(99.99 + 8.5));
    expect(round2(normal.deposit)).toBe(normal.deposit); // already at most 2 decimals
  });

  it("prices extras per stay, per night or per guest", () => {
    expect(extraTotal(500, "PER_STAY", 2, 3, 4)).toBe(1000);
    expect(extraTotal(500, "PER_NIGHT", 1, 3, 4)).toBe(1500);
    expect(extraTotal(500, "PER_GUEST", 1, 3, 4)).toBe(2000);
  });
});

describe("housekeeping → room status", () => {
  it("returns a cleaned room to service", () => {
    expect(roomStatusAfterHousekeeping("CLEANING", "CLEAN")).toBe("AVAILABLE");
    expect(roomStatusAfterHousekeeping("CLEANING", "INSPECTION")).toBe("AVAILABLE");
    expect(roomStatusAfterHousekeeping("MAINTENANCE", "CLEAN")).toBe("AVAILABLE");
  });

  it("holds dirty rooms out of service but never touches occupied or out-of-service rooms", () => {
    expect(roomStatusAfterHousekeeping("AVAILABLE", "DIRTY")).toBe("CLEANING");
    expect(roomStatusAfterHousekeeping("OCCUPIED", "DIRTY")).toBe("OCCUPIED");
    expect(roomStatusAfterHousekeeping("OCCUPIED", "MAINTENANCE")).toBe("OCCUPIED");
    expect(roomStatusAfterHousekeeping("OUT_OF_SERVICE", "CLEAN")).toBe("OUT_OF_SERVICE");
  });

  it("sends a room flagged for maintenance to maintenance", () => {
    expect(roomStatusAfterHousekeeping("AVAILABLE", "MAINTENANCE")).toBe("MAINTENANCE");
  });
});
