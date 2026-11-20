import { describe, expect, it } from "vitest";

import {
  calculateBill,
  calculateChange,
  discountPercentOf,
  shareOfBill,
  splitEqually,
} from "./billing";

describe("calculateBill", () => {
  it("applies discount, then service charge, then tax", () => {
    const bill = calculateBill({
      subtotal: 1000,
      discount: { type: "PERCENT", value: 10 },
      serviceChargePercent: 10,
      taxPercent: 5,
    });
    expect(bill).toEqual({
      subtotal: 1000,
      discountAmount: 100,
      serviceChargeAmount: 90,
      taxAmount: 49.5,
      total: 1039.5,
    });
  });

  it("supports fixed discounts and never discounts below zero", () => {
    const fixed = calculateBill({
      subtotal: 500,
      discount: { type: "AMOUNT", value: 50 },
      serviceChargePercent: 0,
      taxPercent: 0,
    });
    expect(fixed.total).toBe(450);
    const over = calculateBill({
      subtotal: 500,
      discount: { type: "AMOUNT", value: 9999 },
      serviceChargePercent: 10,
      taxPercent: 10,
    });
    expect(over.discountAmount).toBe(500);
    expect(over.total).toBe(0);
  });

  it("rounds each step to whole cents", () => {
    const bill = calculateBill({
      subtotal: 33.33,
      serviceChargePercent: 12.5,
      taxPercent: 8,
    });
    expect(bill.serviceChargeAmount).toBe(4.17);
    expect(bill.taxAmount).toBe(3.0);
    expect(bill.total).toBe(40.5);
  });
});

describe("splitting", () => {
  it("splits equally with the remainder cents on the first parts", () => {
    const parts = splitEqually(100, 3);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });

  it("rejects a non-positive party size", () => {
    expect(() => splitEqually(100, 0)).toThrow(RangeError);
  });

  it("shares tax and service proportionally, and the whole selection is the whole bill", () => {
    expect(shareOfBill(1100, 1000, 250)).toBe(275);
    expect(shareOfBill(1100, 1000, 1000)).toBe(1100);
    expect(shareOfBill(0, 0, 0)).toBe(0);
  });
});

describe("cash", () => {
  it("computes change and never goes negative", () => {
    expect(calculateChange(2000, 1539.5)).toBe(460.5);
    expect(calculateChange(100, 150)).toBe(0);
  });

  it("measures a discount against the subtotal", () => {
    expect(discountPercentOf(1000, 100)).toBe(10);
    expect(discountPercentOf(0, 10)).toBe(0);
  });
});
