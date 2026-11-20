import { describe, expect, it } from "vitest";

import { deriveOrderStatus, kitchenPriority } from "./orders";

describe("deriveOrderStatus", () => {
  it("follows the least advanced item through the kitchen", () => {
    expect(deriveOrderStatus(["PENDING", "PENDING"])).toBe("SENT_TO_KITCHEN");
    expect(deriveOrderStatus(["PENDING", "PREPARING"])).toBe("PREPARING");
    expect(deriveOrderStatus(["PREPARING", "PREPARING"])).toBe("PREPARING");
  });

  it("reports partial and full readiness", () => {
    expect(deriveOrderStatus(["PREPARED", "PENDING"])).toBe("PARTIALLY_READY");
    expect(deriveOrderStatus(["PREPARED", "PREPARING"])).toBe("PARTIALLY_READY");
    expect(deriveOrderStatus(["PREPARED", "PREPARED"])).toBe("READY_TO_SERVE");
  });

  it("reports partial and full serving", () => {
    expect(deriveOrderStatus(["SERVED", "PREPARED"])).toBe("PARTIALLY_SERVED");
    expect(deriveOrderStatus(["SERVED", "PENDING"])).toBe("PARTIALLY_SERVED");
    expect(deriveOrderStatus(["SERVED", "SERVED"])).toBe("SERVED");
  });

  it("ignores cancelled items and detects a fully cancelled order", () => {
    expect(deriveOrderStatus(["CANCELLED", "SERVED"])).toBe("SERVED");
    expect(deriveOrderStatus(["CANCELLED", "PREPARED"])).toBe("READY_TO_SERVE");
    expect(deriveOrderStatus(["CANCELLED", "CANCELLED"])).toBeNull();
    expect(deriveOrderStatus([])).toBeNull();
  });
});

describe("kitchenPriority", () => {
  it("escalates by elapsed minutes", () => {
    expect(kitchenPriority(0)).toBe("NORMAL");
    expect(kitchenPriority(9.9)).toBe("NORMAL");
    expect(kitchenPriority(10)).toBe("ATTENTION");
    expect(kitchenPriority(19)).toBe("ATTENTION");
    expect(kitchenPriority(20)).toBe("URGENT");
    expect(kitchenPriority(90)).toBe("URGENT");
  });
});
