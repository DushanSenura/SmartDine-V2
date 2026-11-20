import type { DiscountType } from "../constants/payments";

/**
 * Bill arithmetic. All money is handled in integer cents internally so totals never drift by a
 * fraction, and so the amounts the cashier sees are exactly the amounts the server charges.
 */
const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;

export interface BillInput {
  subtotal: number;
  discount?: { type: DiscountType; value: number } | null;
  serviceChargePercent: number;
  taxPercent: number;
}

export interface BillAmounts {
  subtotal: number;
  discountAmount: number;
  serviceChargeAmount: number;
  taxAmount: number;
  total: number;
}

/**
 * subtotal − discount, then service charge on the discounted amount, then tax on (discounted +
 * service charge). A discount can never exceed the subtotal.
 */
export function calculateBill(input: BillInput): BillAmounts {
  const subtotal = toCents(input.subtotal);
  const rawDiscount = !input.discount
    ? 0
    : input.discount.type === "PERCENT"
      ? Math.round((subtotal * input.discount.value) / 100)
      : toCents(input.discount.value);
  const discount = Math.min(Math.max(rawDiscount, 0), subtotal);
  const net = subtotal - discount;
  const service = Math.round((net * input.serviceChargePercent) / 100);
  const tax = Math.round(((net + service) * input.taxPercent) / 100);
  return {
    subtotal: fromCents(subtotal),
    discountAmount: fromCents(discount),
    serviceChargeAmount: fromCents(service),
    taxAmount: fromCents(tax),
    total: fromCents(net + service + tax),
  };
}

/** What share of the subtotal a discount is, as a percentage (for the cashier's limit). */
export function discountPercentOf(subtotal: number, discountAmount: number): number {
  return subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
}

/** Splits `total` into `parts` amounts that add up to exactly `total`; extra cents go to the first parts. */
export function splitEqually(total: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1)
    throw new RangeError("parts must be a positive integer");
  const cents = toCents(total);
  const base = Math.floor(cents / parts);
  const extra = cents - base * parts;
  return Array.from({ length: parts }, (_, i) => fromCents(base + (i < extra ? 1 : 0)));
}

/**
 * A share of the bill proportional to the selected part of the subtotal, so discount, service charge
 * and tax are split fairly. Selecting the whole subtotal returns the whole total.
 */
export function shareOfBill(total: number, subtotal: number, selectedSubtotal: number): number {
  if (subtotal <= 0) return 0;
  if (selectedSubtotal >= subtotal) return total;
  return fromCents(Math.round((toCents(total) * toCents(selectedSubtotal)) / toCents(subtotal)));
}

/** Change owed on a cash payment (never negative). */
export function calculateChange(tendered: number, amount: number): number {
  return fromCents(Math.max(0, toCents(tendered) - toCents(amount)));
}

export const roundMoney = (amount: number) => fromCents(toCents(amount));
