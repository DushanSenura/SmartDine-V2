import { describe, expect, it } from "vitest";

import { inHappyHour, maxRedeemablePoints, pointsForBill, pointsValue } from "./customers";

describe("loyalty maths", () => {
  it("earns whole points per spend, scaled by a multiplier", () => {
    expect(pointsForBill(1732.5, 100)).toBe(17);
    expect(pointsForBill(1732.5, 100, 2)).toBe(34);
    expect(pointsForBill(99, 100)).toBe(0);
    expect(pointsForBill(0, 100)).toBe(0);
    expect(pointsForBill(500, 0)).toBe(0);
  });

  it("never lets a multiplier below 1 reduce points", () => {
    expect(pointsForBill(1000, 100, 0.5)).toBe(10);
  });

  it("values points and caps redemption at the balance due and the points held", () => {
    expect(pointsValue(250, 0.5)).toBe(125);
    expect(maxRedeemablePoints(1000, 300, 1)).toBe(300);
    expect(maxRedeemablePoints(120, 300, 1)).toBe(120);
    expect(maxRedeemablePoints(1000, 300.9, 1)).toBe(300);
    expect(maxRedeemablePoints(1000, 0, 1)).toBe(0);
    expect(maxRedeemablePoints(1000, 300, 0)).toBe(0);
  });
});

describe("inHappyHour", () => {
  const weekdays = { daysOfWeek: [1, 2, 3, 4, 5], startTime: "16:00", endTime: "18:00" };

  it("matches the days and the time window, end exclusive", () => {
    expect(inHappyHour(weekdays, 3, "16:00")).toBe(true);
    expect(inHappyHour(weekdays, 3, "17:59")).toBe(true);
    expect(inHappyHour(weekdays, 3, "18:00")).toBe(false);
    expect(inHappyHour(weekdays, 6, "17:00")).toBe(false);
  });

  it("treats no days as every day and no times as all day", () => {
    expect(inHappyHour({ daysOfWeek: [], startTime: "16:00", endTime: "18:00" }, 7, "17:00")).toBe(
      true,
    );
    expect(inHappyHour({ daysOfWeek: [6], startTime: null, endTime: null }, 6, "03:00")).toBe(true);
    expect(inHappyHour({ daysOfWeek: [6], startTime: null, endTime: null }, 5, "03:00")).toBe(
      false,
    );
  });

  it("lets a late window run past midnight into the next morning", () => {
    const late = { daysOfWeek: [5], startTime: "22:00", endTime: "02:00" }; // Fridays
    expect(inHappyHour(late, 5, "23:00")).toBe(true);
    expect(inHappyHour(late, 6, "01:00")).toBe(true); // Saturday early hours belong to Friday
    expect(inHappyHour(late, 5, "01:00")).toBe(false);
    expect(inHappyHour(late, 6, "23:00")).toBe(false);
  });
});
