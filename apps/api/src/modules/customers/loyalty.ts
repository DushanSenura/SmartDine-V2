import type { LoyaltyTransactionType } from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { AppError } from "../../shared/errors/AppError";

type Tx = Prisma.TransactionClient;

/**
 * Moves a customer's points and writes the ledger row in one step, under a row lock so two bills
 * settling at once can't both read the old balance. Spending more than is held is refused.
 */
export async function postPoints(
  tx: Tx,
  userId: string,
  type: LoyaltyTransactionType,
  points: number,
  extra: { billId?: string | null; note?: string | null; staffId?: string | null } = {},
) {
  await tx.loyaltyAccount.upsert({ where: { userId }, create: { userId }, update: {} });
  // `FOR UPDATE` serialises concurrent postings for this customer.
  await tx.$queryRaw`SELECT id FROM loyalty_accounts WHERE "userId" = ${userId}::uuid FOR UPDATE`;
  const account = await tx.loyaltyAccount.findUniqueOrThrow({ where: { userId } });
  const balanceAfter = account.points + points;
  if (balanceAfter < 0) {
    throw AppError.conflict(
      "INSUFFICIENT_POINTS",
      `This customer only has ${account.points} point${account.points === 1 ? "" : "s"}.`,
    );
  }
  await tx.loyaltyAccount.update({
    where: { id: account.id },
    data: {
      points: balanceAfter,
      // Lifetime points only ever grow with real earning.
      ...(type === "EARN" && { lifetimePoints: { increment: points } }),
    },
  });
  await tx.loyaltyTransaction.create({
    data: {
      accountId: account.id,
      type,
      points,
      balanceAfter,
      billId: extra.billId ?? null,
      note: extra.note ?? null,
      userId: extra.staffId ?? null,
    },
  });
  return balanceAfter;
}

/** Spend as much of `points` as the customer has left (used when clawing back earned points). */
export async function postPointsUpTo(
  tx: Tx,
  userId: string,
  type: LoyaltyTransactionType,
  points: number,
  extra: { billId?: string | null; note?: string | null; staffId?: string | null } = {},
) {
  const account = await tx.loyaltyAccount.findUnique({ where: { userId } });
  const spendable = Math.min(points, account?.points ?? 0);
  if (spendable > 0) await postPoints(tx, userId, type, -spendable, extra);
  return spendable;
}
