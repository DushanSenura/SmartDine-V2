import { describe, expect, it } from "vitest";

import { inventoryStatus, stockDelta } from "./inventory";

describe("stockDelta", () => {
  it("adds purchases and removes everything that leaves the branch", () => {
    expect(stockDelta("PURCHASE", 5)).toBe(5);
    expect(stockDelta("USE", 5)).toBe(-5);
    expect(stockDelta("WASTE", 5)).toBe(-5);
    expect(stockDelta("RETURN", 5)).toBe(-5);
    expect(stockDelta("TRANSFER", 5)).toBe(-5);
  });
});

describe("inventoryStatus", () => {
  const today = "2026-11-05";
  const level = (quantity: number, minimumQuantity = 10, expiryDate: string | null = null) => ({
    quantity,
    minimumQuantity,
    expiryDate,
  });

  it("flags empty, low and healthy stock", () => {
    expect(inventoryStatus(level(0), today)).toBe("OUT_OF_STOCK");
    expect(inventoryStatus(level(10), today)).toBe("LOW_STOCK"); // at the reorder level
    expect(inventoryStatus(level(11), today)).toBe("IN_STOCK");
  });

  it("flags stock that expires within a week, or already has", () => {
    expect(inventoryStatus(level(50, 10, "2026-11-12"), today)).toBe("EXPIRING");
    expect(inventoryStatus(level(50, 10, "2026-11-13"), today)).toBe("IN_STOCK");
    expect(inventoryStatus(level(50, 10, "2026-10-01"), today)).toBe("EXPIRING");
  });

  it("reports the most urgent problem first", () => {
    expect(inventoryStatus(level(0, 10, "2026-11-06"), today)).toBe("OUT_OF_STOCK");
    expect(inventoryStatus(level(5, 10, "2026-11-06"), today)).toBe("EXPIRING");
  });
});
