import { describe, expect, it } from "vitest";

import { compact, niceMax } from "./chartMath";

describe("niceMax", () => {
  it("rounds an axis ceiling up to a readable number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(2132.5)).toBe(2500);
    expect(niceMax(4999)).toBe(5000);
    expect(niceMax(5001)).toBe(10000);
  });

  it("never returns less than the largest value", () => {
    for (const v of [1, 3.3, 99, 101, 999, 12_345, 0.4])
      expect(niceMax(v)).toBeGreaterThanOrEqual(v);
  });
});

describe("compact", () => {
  it("shortens big numbers for axis labels", () => {
    expect(compact(950)).toBe("950");
    expect(compact(12_500)).toBe("12.5K");
    expect(compact(2_000_000)).toBe("2M");
  });
});
