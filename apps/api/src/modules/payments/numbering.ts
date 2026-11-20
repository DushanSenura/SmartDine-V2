import type { Prisma } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

/**
 * One visit, one number. A bill and its receipt reuse the order's own number ("20261104-007"), so the
 * order, the bill and the receipt can be matched at a glance: order 20261104-007, bill B-20261104-007,
 * receipt R-20261104-007. Order numbers are already unique per branch, so these are too, and a bill
 * has exactly one order and one receipt.
 */
export const billNumberFor = (orderNumber: string) => `B-${orderNumber}`;
export const receiptNumberFor = (orderNumber: string) => `R-${orderNumber}`;
