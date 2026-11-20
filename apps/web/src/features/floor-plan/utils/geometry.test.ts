import { describe, expect, it } from "vitest";

import { findFreeSpot, moveRect, nextTableNumber, resizeRect, snap } from "./geometry";

const bounds = { width: 400, height: 300 };
const table = { x: 100, y: 100, w: 80, h: 80 };

describe("floor geometry", () => {
  it("snaps to the 10px grid", () => {
    expect(snap(104)).toBe(100);
    expect(snap(106)).toBe(110);
  });

  it("moves with snapping and stays inside the canvas", () => {
    expect(moveRect(table, 23, -17, bounds)).toMatchObject({ x: 120, y: 80 });
    expect(moveRect(table, -500, -500, bounds)).toMatchObject({ x: 0, y: 0 });
    expect(moveRect(table, 900, 900, bounds)).toMatchObject({ x: 320, y: 220 });
  });

  it("resizes with a minimum size and the canvas edge as maximum", () => {
    expect(resizeRect(table, 41, 0, bounds)).toMatchObject({ w: 120, h: 80 });
    expect(resizeRect(table, -200, -200, bounds)).toMatchObject({ w: 40, h: 40 });
    expect(resizeRect(table, 999, 999, bounds)).toMatchObject({ w: 300, h: 200 });
  });

  it("keeps square and round tables square", () => {
    const r = resizeRect(table, 60, 10, bounds, true);
    expect(r.w).toBe(r.h);
    expect(r.w).toBe(140);
  });

  it("finds a free spot that avoids existing tables", () => {
    const spot = findFreeSpot([{ x: 20, y: 20, w: 80, h: 80 }], { w: 80, h: 80 }, bounds);
    expect(spot).not.toEqual({ x: 20, y: 20 });
    expect(spot.x >= 110 || spot.y >= 110).toBe(true);
  });

  it("proposes the next table number", () => {
    expect(nextTableNumber([])).toBe("1");
    expect(nextTableNumber(["1", "2", "9", "VIP"])).toBe("10");
  });
});
