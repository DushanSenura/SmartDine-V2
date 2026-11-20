import type { MenuItemDto } from "@smartdine/shared";
import { describe, expect, it } from "vitest";

import { addLine, cartTotal, toOrderLines, unitPrice } from "./cart";

const burger = {
  id: "burger",
  price: 1000,
  modifiers: [
    { id: "cheese", name: "Extra cheese", priceDelta: 200, isActive: true },
    { id: "plain", name: "Plain", priceDelta: -100, isActive: true },
  ],
} as unknown as MenuItemDto;

describe("cart", () => {
  it("prices a dish with its chosen options", () => {
    expect(unitPrice(burger, [])).toBe(1000);
    expect(unitPrice(burger, ["cheese"])).toBe(1200);
    expect(unitPrice(burger, ["cheese", "plain"])).toBe(1100);
  });

  it("merges identical lines and keeps different options apart", () => {
    let lines = addLine([], burger, 1, "", []);
    lines = addLine(lines, burger, 2, "", []);
    lines = addLine(lines, burger, 1, "", ["cheese"]);
    lines = addLine(lines, burger, 1, "no onions", []);
    expect(lines.map((l) => l.quantity)).toEqual([3, 1, 1]);
    expect(cartTotal(lines)).toBe(3 * 1000 + 1200 + 1000);
  });

  it("caps merged quantity at the server limit", () => {
    let lines = addLine([], burger, 40, "", []);
    lines = addLine(lines, burger, 40, "", []);
    expect(lines[0]!.quantity).toBe(50);
  });

  it("converts to API lines, dropping blank notes", () => {
    const lines = addLine([], burger, 2, "  ", ["cheese"]);
    expect(toOrderLines(lines)).toEqual([
      { menuItemId: "burger", quantity: 2, notes: null, modifierIds: ["cheese"] },
    ]);
  });
});
