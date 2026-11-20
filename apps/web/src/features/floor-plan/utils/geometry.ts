export const GRID = 10;
export const MIN_SIZE = 40;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Bounds {
  width: number;
  height: number;
}

export const snap = (value: number, grid = GRID) => Math.round(value / grid) * grid;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Moves a rectangle by a pointer delta, snapped to the grid and kept inside the canvas. */
export function moveRect(start: Rect, dx: number, dy: number, bounds: Bounds): Rect {
  return {
    ...start,
    x: clamp(snap(start.x + dx), 0, Math.max(0, bounds.width - start.w)),
    y: clamp(snap(start.y + dy), 0, Math.max(0, bounds.height - start.h)),
  };
}

/**
 * Resizes from the bottom-right corner. `keepSquare` (square / round tables) forces equal sides
 * using the larger pointer delta, so the table stays a square or circle.
 */
export function resizeRect(
  start: Rect,
  dx: number,
  dy: number,
  bounds: Bounds,
  keepSquare = false,
): Rect {
  const maxW = bounds.width - start.x;
  const maxH = bounds.height - start.y;
  let w = clamp(snap(start.w + dx), MIN_SIZE, Math.max(MIN_SIZE, maxW));
  let h = clamp(snap(start.h + dy), MIN_SIZE, Math.max(MIN_SIZE, maxH));
  if (keepSquare) {
    const side = Math.min(Math.max(w, h), maxW, maxH);
    w = h = Math.max(MIN_SIZE, snap(side));
  }
  return { ...start, w, h };
}

const overlaps = (a: Rect, b: Rect, gap = 10) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

/** First grid position (scanning left→right, top→bottom) where a new table does not overlap another. */
export function findFreeSpot(
  existing: Rect[],
  size: { w: number; h: number },
  bounds: Bounds,
): { x: number; y: number } {
  const step = 20;
  for (let y = step; y + size.h <= bounds.height; y += step) {
    for (let x = step; x + size.w <= bounds.width; x += step) {
      if (!existing.some((other) => overlaps({ x, y, ...size }, other))) return { x, y };
    }
  }
  return { x: step, y: step }; // canvas is full; the manager can rearrange
}

/** Next numeric table number not already used (non-numeric numbers are ignored). */
export function nextTableNumber(numbers: string[]): string {
  const used = numbers.map((n) => Number.parseInt(n, 10)).filter(Number.isFinite);
  return String((used.length ? Math.max(...used) : 0) + 1);
}
