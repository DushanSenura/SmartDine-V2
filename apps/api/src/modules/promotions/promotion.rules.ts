import { inHappyHour } from "@smartdine/shared";
import type { Prisma, Promotion } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** The branch's local date (YYYY-MM-DD), ISO weekday (1 = Monday) and time (HH:MM) right now. */
export function branchLocalNow(timezone: string, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const weekday =
    WEEKDAYS[
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now)
    ]!;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return { date, weekday, time };
}

const dateText = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Why a promotion can't be used right now, or `null` if it can. Usage limits are checked separately, atomically. */
export function promotionBlocker(
  promo: Promotion,
  ctx: {
    branchId: string;
    customerId: string | null;
    subtotal: number;
    local: ReturnType<typeof branchLocalNow>;
  },
): string | null {
  if (!promo.active || promo.deletedAt) return "This promotion isn't active.";
  if (promo.startsOn && dateText(promo.startsOn)! > ctx.local.date)
    return "This promotion hasn't started yet.";
  if (promo.endsOn && dateText(promo.endsOn)! < ctx.local.date) return "This promotion has ended.";
  if (promo.branchIds.length > 0 && !promo.branchIds.includes(ctx.branchId)) {
    return "This promotion isn't available at this branch.";
  }
  if (
    promo.customerIds.length > 0 &&
    (!ctx.customerId || !promo.customerIds.includes(ctx.customerId))
  ) {
    return "This promotion is only for specific customers. Attach the customer to the bill first.";
  }
  if (ctx.subtotal < Number(promo.minimumSpend)) {
    return `This promotion needs a minimum spend of ${Number(promo.minimumSpend).toFixed(2)}.`;
  }
  const windowed = promo.type === "HAPPY_HOUR" || promo.daysOfWeek.length > 0 || !!promo.startTime;
  if (windowed && !inHappyHour(promo, ctx.local.weekday, ctx.local.time)) {
    return "This promotion isn't running at this time.";
  }
  return null;
}

/**
 * Takes one use of a limited promotion. The check and the increment are one statement, so two
 * cashiers redeeming the last use at once can't both succeed.
 */
export async function reservePromotionUse(tx: Tx, promotionId: string): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE promotions SET "usedCount" = "usedCount" + 1
    WHERE id = ${promotionId}::uuid AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
  return updated === 1;
}

/** Gives back the use a bill was holding (the discount was removed or replaced, or the bill voided). */
export async function releasePromotion(tx: Tx, billId: string) {
  const bill = await tx.bill.findUnique({ where: { id: billId }, select: { promotionId: true } });
  if (!bill?.promotionId) return;
  await tx.promotion.updateMany({
    where: { id: bill.promotionId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
  await tx.bill.update({ where: { id: billId }, data: { promotionId: null } });
}

/** The best points multiplier running for this customer, branch and moment (1 when none). */
export async function bestMultiplier(
  tx: Tx,
  ctx: { branchId: string; customerId: string; subtotal: number; timezone: string },
): Promise<number> {
  const local = branchLocalNow(ctx.timezone);
  const promos = await tx.promotion.findMany({
    where: { type: "LOYALTY_MULTIPLIER", active: true, deletedAt: null },
  });
  return promos.reduce((best, promo) => {
    const blocked = promotionBlocker(promo, {
      branchId: ctx.branchId,
      customerId: ctx.customerId,
      subtotal: ctx.subtotal,
      local,
    });
    return blocked ? best : Math.max(best, Number(promo.value));
  }, 1);
}
