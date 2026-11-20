import type { MenuItemDto, OrderLineInput } from "@smartdine/shared";

/** A dish in the cart before the order exists on the server. */
export interface CartLine {
  key: string;
  item: MenuItemDto;
  quantity: number;
  notes: string;
  modifierIds: string[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Menu price plus the chosen options. The server recomputes this; the cart only previews it. */
export function unitPrice(item: MenuItemDto, modifierIds: string[]): number {
  const extras = item.modifiers
    .filter((m) => modifierIds.includes(m.id))
    .reduce((sum, m) => sum + m.priceDelta, 0);
  return Math.max(0, round2(item.price + extras));
}

export const lineTotal = (line: CartLine) =>
  round2(unitPrice(line.item, line.modifierIds) * line.quantity);

export const cartTotal = (lines: CartLine[]) =>
  round2(lines.reduce((sum, l) => sum + lineTotal(l), 0));

/** Two lines are the same order line when dish, options and note all match. */
export const lineSignature = (item: MenuItemDto, modifierIds: string[], notes: string) =>
  `${item.id}|${[...modifierIds].sort().join(",")}|${notes.trim()}`;

export function toOrderLines(lines: CartLine[]): OrderLineInput[] {
  return lines.map((l) => ({
    menuItemId: l.item.id,
    quantity: l.quantity,
    notes: l.notes.trim() || null,
    modifierIds: l.modifierIds,
  }));
}

/** Adds a line, merging into an identical existing one. */
export function addLine(
  lines: CartLine[],
  item: MenuItemDto,
  quantity: number,
  notes: string,
  modifierIds: string[],
): CartLine[] {
  const signature = lineSignature(item, modifierIds, notes);
  const existing = lines.find((l) => lineSignature(l.item, l.modifierIds, l.notes) === signature);
  if (existing)
    return lines.map((l) =>
      l === existing ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l,
    );
  return [...lines, { key: crypto.randomUUID(), item, quantity, notes, modifierIds }];
}
