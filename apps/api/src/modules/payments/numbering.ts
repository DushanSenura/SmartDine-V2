import type { Prisma } from "@prisma/client";

import { localToUtc } from "../reservations/reservation.timing";

export type Tx = Prisma.TransactionClient;

/** Takes a transaction-scoped advisory lock; callers always lock bill → branch, never the reverse. */
export const lockKey = (tx: Tx, key: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

/** "B-20261104-007": next sequence for today in the branch's timezone. Call under the branch lock. */
export async function nextNumber(
  tx: Tx,
  kind: "bill" | "receipt",
  branchId: string,
  timezone: string,
) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const since = localToUtc(today, "00:00", timezone);
  const count =
    kind === "bill"
      ? await tx.bill.count({ where: { branchId, createdAt: { gte: since } } })
      : await tx.receipt.count({ where: { branchId, issuedAt: { gte: since } } });
  return `${kind === "bill" ? "B" : "R"}-${today.replaceAll("-", "")}-${String(count + 1).padStart(3, "0")}`;
}
