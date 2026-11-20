import {
  BILL_PROMOTION_TYPES,
  BILLABLE_ORDER_STATUSES,
  calculateBill,
  CASHIER_DISCOUNT_MAX_PERCENT,
  discountPercentOf,
  Permissions,
  roleHasPermission,
  SocketEvents,
  type ApplyDiscountInput,
  type BillDto,
  type BillQueueItemDto,
  type DiscountType,
  type OrderStatus,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { events } from "../notifications/notify.events";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import { isUniqueViolation, withResourceLock } from "../../utils/prisma";
import { loyaltySettings } from "../customers/customer.service";
import { announce, publishTable } from "../orders/order.service";
import {
  branchLocalNow,
  promotionBlocker,
  releasePromotion,
  reservePromotionUse,
} from "../promotions/promotion.rules";
import { nextNumber } from "./numbering";
import {
  billInclude,
  locationOf,
  toBillDto,
  type BillRecord,
  type LoyaltyRules,
} from "./payment.mapper";
import { settleBill } from "./settle";

const BILLABLE: OrderStatus[] = [...BILLABLE_ORDER_STATUSES];

export const isBillable = (status: OrderStatus) => BILLABLE.includes(status);

/** Recomputes a bill's amounts from the order subtotal and the bill's own discount and rates. */
export function amountsFor(
  bill: {
    discountType: "PERCENT" | "AMOUNT" | null;
    discountValue: Prisma.Decimal | number;
    serviceChargePercent: Prisma.Decimal;
    taxPercent: Prisma.Decimal;
  },
  subtotal: number,
) {
  return calculateBill({
    subtotal,
    discount: bill.discountType
      ? { type: bill.discountType, value: Number(bill.discountValue) }
      : null,
    serviceChargePercent: Number(bill.serviceChargePercent),
    taxPercent: Number(bill.taxPercent),
  });
}

export const amountData = (a: ReturnType<typeof calculateBill>) => ({
  subtotal: a.subtotal,
  discountAmount: a.discountAmount,
  serviceChargeAmount: a.serviceChargeAmount,
  taxAmount: a.taxAmount,
  total: a.total,
});

export async function loadBill(auth: AuthContext, id: string): Promise<BillRecord> {
  const bill = await prisma.bill.findUnique({ where: { id }, include: billInclude });
  if (!bill) throw AppError.notFound("Bill not found.");
  assertBranchAccess(auth, bill.branchId);
  return bill;
}

export const currencyOf = async (branchId: string) =>
  (await prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { currency: true } }))
    .currency;

export async function loyaltyRules(): Promise<LoyaltyRules> {
  const [{ enabled, pointValue }, settings] = await Promise.all([
    loyaltySettings(),
    prisma.companySettings.findFirst(),
  ]);
  return {
    enabled,
    pointValue,
    discountLimitPercent: Number(
      settings?.cashierDiscountLimitPercent ?? CASHIER_DISCOUNT_MAX_PERCENT,
    ),
    paymentMethods: (settings?.enabledPaymentMethods ?? ["CASH"]).filter(
      (m) => m !== "LOYALTY_POINTS",
    ),
  };
}

type Tx = Prisma.TransactionClient;

/**
 * The bill, re-read inside its lock and checked to still be editable. A discount, promo or customer
 * can only change while the bill is open, and (for money changes) before any payment was taken.
 */
async function editableBill(tx: Tx, id: string, opts: { allowPayments?: boolean } = {}) {
  const fresh = await tx.bill.findUniqueOrThrow({
    where: { id },
    include: { payments: { select: { id: true } }, order: { select: { subtotal: true } } },
  });
  if (fresh.status !== "OPEN") {
    throw AppError.conflict("BILL_CLOSED", "This bill is already settled.");
  }
  if (!opts.allowPayments && fresh.payments.length > 0) {
    throw AppError.conflict(
      "BILL_HAS_PAYMENTS",
      "A payment was already taken, so the discount can no longer change.",
    );
  }
  return { fresh, subtotal: Number(fresh.order.subtotal) };
}

interface DiscountChange {
  type: DiscountType | null;
  value: number;
  reason: string | null;
  promotionId: string | null;
}

/** Stores a discount and the totals it produces; a bill that ends up free settles straight away. */
async function writeDiscount(
  tx: Tx,
  bill: Parameters<typeof amountsFor>[0] & { id: string },
  subtotal: number,
  userId: string,
  change: DiscountChange,
) {
  const amounts = amountsFor(
    { ...bill, discountType: change.type, discountValue: change.value },
    subtotal,
  );
  await tx.bill.update({
    where: { id: bill.id },
    data: {
      ...amountData(amounts),
      discountType: change.type,
      discountValue: change.value,
      discountReason: change.reason,
      discountById: change.type ? userId : null,
      promotionId: change.promotionId,
    },
  });
  // A fully discounted (complimentary) bill has nothing to collect, so it settles right away.
  const settledTable = amounts.total === 0 ? (await settleBill(tx, bill.id, userId)).tableId : null;
  return { amounts, settledTable };
}

/** Thanks the customer once their bill is settled. Called wherever a bill can become paid. */
export function notifyIfPaid(bill: BillDto) {
  if (bill.status === "PAID" && bill.customer) {
    void events.paymentReceived({
      customerId: bill.customer.id,
      branchId: bill.branchId,
      billNumber: bill.billNumber,
      receiptId: bill.receiptId,
    });
  }
}

export function announceBill(bill: {
  id: string;
  orderId: string;
  branchId: string;
  status: string;
}) {
  emitToBranch(bill.branchId, SocketEvents.PAYMENT_CHANGED, {
    id: bill.id,
    orderId: bill.orderId,
    branchId: bill.branchId,
    status: bill.status,
  });
}

export const billService = {
  /** Orders waiting at the till: served or with the bill requested, and not yet paid. */
  async queue(auth: AuthContext, requestedBranch?: string): Promise<BillQueueItemDto[]> {
    const branchId = requireBranch(auth, requestedBranch);
    const [orders, currency] = await Promise.all([
      prisma.order.findMany({
        where: { branchId, status: { in: BILLABLE } },
        include: {
          table: { select: { tableNumber: true } },
          room: { select: { roomNumber: true } },
          waiter: { select: { firstName: true, lastName: true } },
          bill: { select: { id: true, total: true, paidAmount: true } },
        },
        orderBy: [{ paymentRequestedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: 200,
      }),
      currencyOf(branchId),
    ]);
    return orders.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      orderStatus: o.status,
      location: locationOf(o),
      waiterName: `${o.waiter.firstName} ${o.waiter.lastName}`,
      subtotal: Number(o.subtotal),
      currency,
      requestedAt: o.paymentRequestedAt?.toISOString() ?? null,
      billId: o.bill?.id ?? null,
      total: o.bill ? Number(o.bill.total) : null,
      paidAmount: o.bill ? Number(o.bill.paidAmount) : 0,
    }));
  },

  /** Raises the bill for a served order (or returns the one that already exists). */
  async generate(auth: AuthContext, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        bill: { select: { id: true } },
        branch: { select: { timezone: true, currency: true } },
      },
    });
    if (!order) throw AppError.notFound("Order not found.");
    assertBranchAccess(auth, order.branchId);
    if (order.bill) return billService.get(auth, order.bill.id);
    if (!isBillable(order.status)) {
      throw AppError.conflict(
        "ORDER_NOT_BILLABLE",
        "A bill can only be raised once every dish has been served.",
      );
    }
    const settings = await prisma.companySettings.findFirst();

    try {
      const id = await withResourceLock(order.branchId, async (tx) => {
        const taxPercent = Number(settings?.taxRatePercent ?? 0);
        const serviceChargePercent = Number(settings?.serviceChargePercent ?? 0);
        const amounts = calculateBill({
          subtotal: Number(order.subtotal),
          serviceChargePercent,
          taxPercent,
        });
        const bill = await tx.bill.create({
          data: {
            billNumber: await nextNumber(tx, "bill", order.branchId, order.branch.timezone),
            branchId: order.branchId,
            orderId,
            ...amountData(amounts),
            serviceChargePercent,
            taxPercent,
            currency: order.branch.currency,
            roomBookingId: order.roomBookingId,
            createdById: auth.userId,
          },
        });
        return bill.id;
      });
      const created = await loadBill(auth, id);
      announceBill(created);
      return toBillDto(created, order.branch.currency, await loyaltyRules());
    } catch (error) {
      // Two cashiers opened the same order at once: the loser reads the winner's bill.
      if (isUniqueViolation(error, "orderId")) {
        const existing = await prisma.bill.findUniqueOrThrow({ where: { orderId } });
        return billService.get(auth, existing.id);
      }
      throw error;
    }
  },

  async get(auth: AuthContext, id: string) {
    let bill = await loadBill(auth, id);
    // An unpaid bill follows its order: if dishes were cancelled meanwhile, the totals follow too.
    if (
      bill.status === "OPEN" &&
      bill.payments.length === 0 &&
      Number(bill.order.subtotal) !== Number(bill.subtotal)
    ) {
      await prisma.bill.updateMany({
        where: { id, status: "OPEN", paidAmount: 0 },
        data: amountData(amountsFor(bill, Number(bill.order.subtotal))),
      });
      bill = await loadBill(auth, id);
    }
    return toBillDto(bill, await currencyOf(bill.branchId), await loyaltyRules());
  },

  /** Publishes a change made to a bill and returns the fresh view. */
  async finish(auth: AuthContext, id: string, settledTable: string | null = null) {
    const updated = await billService.get(auth, id);
    notifyIfPaid(updated);
    announceBill(updated);
    announce(await prisma.order.findUniqueOrThrow({ where: { id: updated.orderId } }));
    await publishTable(settledTable);
    return updated;
  },

  async applyDiscount(auth: AuthContext, id: string, input: ApplyDiscountInput) {
    const bill = await loadBill(auth, id);
    const limit = (await loyaltyRules()).discountLimitPercent;
    const settledTable = await withResourceLock(id, async (tx) => {
      const { fresh, subtotal } = await editableBill(tx, id);
      const type = input.value === 0 ? null : input.type;
      const preview = amountsFor(
        { ...fresh, discountType: type, discountValue: input.value },
        subtotal,
      );
      if (
        discountPercentOf(subtotal, preview.discountAmount) > limit &&
        !roleHasPermission(auth.role, Permissions.PAYMENTS_DISCOUNT)
      ) {
        throw AppError.forbidden(`Discounts above ${limit}% need a manager.`);
      }
      // A hand-typed discount replaces a promo code, and gives back the use the code was holding.
      await releasePromotion(tx, id);
      return (
        await writeDiscount(tx, fresh, subtotal, auth.userId, {
          type,
          value: input.value,
          reason: type ? (input.reason ?? null) : null,
          promotionId: null,
        })
      ).settledTable;
    });
    void audit(auth, {
      action: "bill.discount_applied",
      entity: "bill",
      entityId: id,
      branchId: bill.branchId,
      newValue: {
        type: input.value === 0 ? null : input.type,
        value: input.value,
        reason: input.reason ?? null,
      },
    });
    return billService.finish(auth, id, settledTable);
  },

  /**
   * Applies a promo code. Pre-approved by management, so unlike a hand-typed discount it isn't held
   * to the cashier's limit. One code per bill; a new code replaces the old one.
   */
  async applyPromo(auth: AuthContext, id: string, rawCode: string) {
    const bill = await loadBill(auth, id);
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: bill.branchId } });
    const code = rawCode.trim().toUpperCase();
    const settledTable = await withResourceLock(id, async (tx) => {
      const { fresh, subtotal } = await editableBill(tx, id);
      const promo = await tx.promotion.findFirst({ where: { code, deletedAt: null } });
      if (!promo || !(BILL_PROMOTION_TYPES as readonly string[]).includes(promo.type)) {
        throw AppError.conflict("PROMO_INVALID", "That code isn't valid.");
      }
      const blocker = promotionBlocker(promo, {
        branchId: fresh.branchId,
        customerId: fresh.customerId,
        subtotal,
        local: branchLocalNow(branch.timezone),
      });
      if (blocker) throw AppError.conflict("PROMO_NOT_APPLICABLE", blocker);
      if (fresh.promotionId === promo.id) return null; // already applied
      await releasePromotion(tx, id);
      if (!(await reservePromotionUse(tx, promo.id))) {
        throw AppError.conflict("PROMO_LIMIT_REACHED", "This code has been used up.");
      }
      return (
        await writeDiscount(tx, fresh, subtotal, auth.userId, {
          type: promo.type === "FIXED" ? "AMOUNT" : "PERCENT",
          value: Number(promo.value),
          reason: `Promo ${promo.code}`,
          promotionId: promo.id,
        })
      ).settledTable;
    });
    return billService.finish(auth, id, settledTable);
  },

  async removePromo(auth: AuthContext, id: string) {
    await loadBill(auth, id);
    await withResourceLock(id, async (tx) => {
      const { fresh, subtotal } = await editableBill(tx, id);
      if (!fresh.promotionId) throw AppError.conflict("NO_PROMO", "No promo code is applied.");
      await releasePromotion(tx, id);
      await writeDiscount(tx, fresh, subtotal, auth.userId, {
        type: null,
        value: 0,
        reason: null,
        promotionId: null,
      });
    });
    return billService.finish(auth, id);
  },

  /** Attaches (or detaches) the customer account that earns and spends loyalty points on this bill. */
  async attachCustomer(auth: AuthContext, id: string, customerId: string | null) {
    await loadBill(auth, id);
    await withResourceLock(id, async (tx) => {
      const { fresh, subtotal } = await editableBill(tx, id, { allowPayments: true });
      if (customerId) {
        const customer = await tx.user.findFirst({
          where: { id: customerId, deletedAt: null, role: { name: "CUSTOMER" } },
        });
        if (!customer) throw AppError.validation("That customer doesn't exist.");
      }
      // A promo reserved for particular customers can't stay on a bill for someone else.
      if (fresh.promotionId && fresh.payments.length === 0) {
        const promo = await tx.promotion.findUnique({ where: { id: fresh.promotionId } });
        const wrongCustomer =
          promo &&
          promo.customerIds.length > 0 &&
          (!customerId || !promo.customerIds.includes(customerId));
        if (wrongCustomer) {
          await releasePromotion(tx, id);
          await writeDiscount(tx, fresh, subtotal, auth.userId, {
            type: null,
            value: 0,
            reason: null,
            promotionId: null,
          });
        }
      }
      await tx.bill.update({ where: { id }, data: { customerId } });
    });
    return billService.finish(auth, id);
  },
};
