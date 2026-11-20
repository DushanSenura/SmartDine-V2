import {
  calculateChange,
  maxRedeemablePoints,
  pointsValue,
  PAYMENT_METHODS,
  type FolioDto,
  type PayBillInput,
  type PaymentDto,
  type PaymentMethod,
  type PaymentSummaryDto,
  type RefundInput,
} from "@smartdine/shared";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { withResourceLock } from "../../utils/prisma";
import { loyaltySettings } from "../customers/customer.service";
import { postPoints, postPointsUpTo } from "../customers/loyalty";
import { announce, publishTable, record } from "../orders/order.service";
import { localToUtc } from "../reservations/reservation.timing";
import {
  amountData,
  amountsFor,
  announceBill,
  notifyIfPaid,
  billService,
  isBillable,
  loadBill,
  loyaltyRules,
} from "./bill.service";
import { billInclude, toPaymentDto } from "./payment.mapper";
import { providerFor } from "./payment.providers";
import { settleBill } from "./settle";

const cents = (n: number | { toString(): string }) => Math.round(Number(n) * 100);
const money = (c: number) => c / 100;

/** The branch-local calendar day containing `date`, as UTC instants. */
function dayRange(dateText: string, timezone: string) {
  const start = localToUtc(dateText, "00:00", timezone);
  return { start, end: new Date(start.getTime() + 24 * 3_600_000) };
}
const todayIn = (timezone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

export const paymentService = {
  async pay(auth: AuthContext, billId: string, input: PayBillInput) {
    const existing = await loadBill(auth, billId);
    const rules = await loyaltyRules();
    if (!rules.paymentMethods.includes(input.method)) {
      throw AppError.conflict(
        "PAYMENT_METHOD_DISABLED",
        "This payment method isn't accepted at the moment.",
      );
    }

    const result = await withResourceLock(billId, async (tx) => {
      const bill = await tx.bill.findUniqueOrThrow({
        where: { id: billId },
        include: { order: { select: { status: true, subtotal: true, roomBookingId: true } } },
      });
      if (bill.status !== "OPEN") {
        throw AppError.conflict("BILL_CLOSED", "This bill is already settled.");
      }
      if (!isBillable(bill.order.status)) {
        throw AppError.conflict(
          "ORDER_NOT_BILLABLE",
          "This order still has dishes to serve, so it can't be paid yet.",
        );
      }

      // Until money moves the bill tracks the order, so a cancelled dish is never charged.
      let total = cents(bill.total);
      const paid = cents(bill.paidAmount);
      if (paid === 0 && cents(bill.order.subtotal) !== cents(bill.subtotal)) {
        const fresh = amountsFor(bill, Number(bill.order.subtotal));
        await tx.bill.update({ where: { id: billId }, data: amountData(fresh) });
        total = cents(fresh.total);
      }

      const amount = cents(input.amount);
      if (amount > total - paid) {
        throw AppError.conflict(
          "OVERPAYMENT",
          `Only ${money(total - paid).toFixed(2)} is left to pay on this bill.`,
        );
      }

      let roomBookingId: string | null = null;
      if (input.method === "ROOM_CHARGE") {
        const stay = bill.roomBookingId
          ? await tx.roomBooking.findFirst({
              where: { id: bill.roomBookingId, bookingStatus: "CHECKED_IN" },
            })
          : null;
        if (!stay) {
          throw AppError.conflict(
            "ROOM_CHARGE_UNAVAILABLE",
            "Room charge needs a room-service order for a guest who is still checked in.",
          );
        }
        roomBookingId = stay.id;
      }

      // The provider seam: a gateway would authorise here; manual entry just records the reference.
      const charge = await providerFor(input.method).charge({
        method: input.method,
        amount: input.amount,
        currency: bill.currency,
        reference: input.reference,
      });
      if (!charge.ok) throw AppError.conflict("PAYMENT_DECLINED", charge.message);

      const tendered = input.method === "CASH" ? (input.tendered ?? input.amount) : null;
      await tx.payment.create({
        data: {
          billId,
          branchId: bill.branchId,
          method: input.method,
          amount: input.amount,
          tendered,
          changeGiven: tendered === null ? null : calculateChange(tendered, input.amount),
          reference: charge.reference,
          roomBookingId,
          cashierId: auth.userId,
        },
      });
      const nowPaid = paid + amount;
      await tx.bill.update({ where: { id: billId }, data: { paidAmount: money(nowPaid) } });

      let tableId: string | null = null;
      if (nowPaid === total) tableId = (await settleBill(tx, billId, auth.userId)).tableId;
      return { tableId };
    });

    const updated = await billService.get(auth, billId);
    notifyIfPaid(updated);
    announceBill(updated);
    announce(await prisma.order.findUniqueOrThrow({ where: { id: existing.orderId } }));
    await publishTable(result.tableId);
    return updated;
  },

  /**
   * Pays part (or all) of a bill with the attached customer's loyalty points. Points are only ever
   * spent here, in the same transaction that records the payment, so they can't be double-spent.
   */
  async redeemPoints(auth: AuthContext, billId: string, points: number) {
    const existing = await loadBill(auth, billId);
    const rules = await loyaltySettings();
    if (!rules.enabled) {
      throw AppError.conflict("LOYALTY_DISABLED", "Loyalty points aren't switched on.");
    }

    const result = await withResourceLock(billId, async (tx) => {
      const bill = await tx.bill.findUniqueOrThrow({
        where: { id: billId },
        include: { order: { select: { status: true } } },
      });
      if (bill.status !== "OPEN") {
        throw AppError.conflict("BILL_CLOSED", "This bill is already settled.");
      }
      if (!isBillable(bill.order.status)) {
        throw AppError.conflict(
          "ORDER_NOT_BILLABLE",
          "This order still has dishes to serve, so it can't be paid yet.",
        );
      }
      if (!bill.customerId) {
        throw AppError.conflict(
          "NO_CUSTOMER",
          "Attach the customer to the bill to use their points.",
        );
      }
      const due = money(cents(bill.total) - cents(bill.paidAmount));
      const account = await tx.loyaltyAccount.findUnique({ where: { userId: bill.customerId } });
      const allowed = maxRedeemablePoints(account?.points ?? 0, due, rules.pointValue);
      if (points > (account?.points ?? 0)) {
        throw AppError.conflict(
          "INSUFFICIENT_POINTS",
          `This customer only has ${account?.points ?? 0} points.`,
        );
      }
      if (points > allowed) {
        throw AppError.conflict(
          "REDEEM_EXCEEDS_BALANCE",
          `At most ${allowed} points can be used on a balance of ${due.toFixed(2)}.`,
        );
      }
      const amount = pointsValue(points, rules.pointValue);
      await postPoints(tx, bill.customerId, "REDEEM", -points, {
        billId,
        note: `Bill ${bill.billNumber}`,
        staffId: auth.userId,
      });
      await tx.payment.create({
        data: {
          billId,
          branchId: bill.branchId,
          method: "LOYALTY_POINTS",
          amount,
          reference: `${points} pts`,
          cashierId: auth.userId,
        },
      });
      const nowPaid = cents(bill.paidAmount) + cents(amount);
      await tx.bill.update({ where: { id: billId }, data: { paidAmount: money(nowPaid) } });
      const tableId =
        nowPaid === cents(bill.total) ? (await settleBill(tx, billId, auth.userId)).tableId : null;
      return { tableId };
    });

    const updated = await billService.get(auth, billId);
    notifyIfPaid(updated);
    announceBill(updated);
    announce(await prisma.order.findUniqueOrThrow({ where: { id: existing.orderId } }));
    await publishTable(result.tableId);
    return updated;
  },

  async refund(auth: AuthContext, paymentId: string, input: RefundInput) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { bill: true },
    });
    if (!payment) throw AppError.notFound("Payment not found.");
    assertBranchAccess(auth, payment.branchId);

    const billId = payment.billId;
    await withResourceLock(billId, async (tx) => {
      const refunded = await tx.refund.aggregate({
        where: { paymentId },
        _sum: { amount: true },
      });
      const refundable = cents(payment.amount) - cents(refunded._sum.amount ?? 0);
      const amount = cents(input.amount);
      if (amount > refundable) {
        throw AppError.conflict(
          "REFUND_EXCEEDS_PAYMENT",
          `At most ${money(refundable).toFixed(2)} can still be refunded on this payment.`,
        );
      }
      await tx.refund.create({
        data: {
          paymentId,
          billId,
          amount: input.amount,
          reason: input.reason,
          userId: auth.userId,
        },
      });
      // Written in the same transaction as the refund, so one never exists without the other.
      await audit(
        auth,
        {
          action: "payment.refunded",
          entity: "payment",
          entityId: paymentId,
          branchId: payment.branchId,
          newValue: { amount: input.amount, reason: input.reason, method: payment.method, billId },
        },
        tx,
      );
      const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
      const totalRefunded = cents(bill.refundedAmount) + amount;
      const fully = totalRefunded >= cents(bill.paidAmount);
      await tx.bill.update({
        where: { id: billId },
        data: { refundedAmount: money(totalRefunded), ...(fully && { status: "REFUNDED" }) },
      });
      // Points spent on the bill go back with a refund of the points payment, in proportion.
      if (payment.method === "LOYALTY_POINTS" && bill.customerId) {
        const spent = await tx.loyaltyTransaction.aggregate({
          where: { billId, type: "REDEEM" },
          _sum: { points: true },
        });
        const back = Math.round((-1 * (spent._sum.points ?? 0) * amount) / cents(payment.amount));
        if (back > 0) {
          await postPoints(tx, bill.customerId, "REFUND", back, {
            billId,
            note: `Refund on bill ${bill.billNumber}`,
            staffId: auth.userId,
          });
        }
      }
      if (fully) {
        // A fully refunded bill earned nothing: take back what is still there to take.
        if (bill.customerId && bill.pointsEarned > 0) {
          await postPointsUpTo(tx, bill.customerId, "ADJUST", bill.pointsEarned, {
            billId,
            note: `Bill ${bill.billNumber} refunded`,
            staffId: auth.userId,
          });
        }
        const { count } = await tx.order.updateMany({
          where: { id: bill.orderId, status: "COMPLETED" },
          data: { status: "REFUNDED" },
        });
        if (count) {
          await record(tx, bill.orderId, auth.userId, "COMPLETED", "REFUNDED", input.reason);
        }
      }
    });

    const bill = await billService.get(auth, billId);
    announceBill(bill);
    announce(await prisma.order.findUniqueOrThrow({ where: { id: bill.orderId } }));
    return bill;
  },

  async list(
    auth: AuthContext,
    query: { branchId?: string; from?: string; to?: string; method?: PaymentMethod },
  ): Promise<PaymentDto[]> {
    const branchId = requireBranch(auth, query.branchId);
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const today = todayIn(branch.timezone);
    const from = dayRange(query.from ?? today, branch.timezone).start;
    const to = dayRange(query.to ?? query.from ?? today, branch.timezone).end;
    const payments = await prisma.payment.findMany({
      where: {
        branchId,
        createdAt: { gte: from, lt: to },
        ...(query.method && { method: query.method }),
        // Cashiers see their own till; managers and owners see the whole branch.
        ...(auth.role === "CASHIER" && { cashierId: auth.userId }),
      },
      include: {
        ...billInclude.payments.include,
        bill: { select: { billNumber: true, order: { select: { orderNumber: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return payments.map((p) => toPaymentDto(p, p.bill.billNumber, p.bill.order.orderNumber));
  },

  /** Today's takings in the branch's timezone: the cashier's own shift or the whole branch. */
  async summary(
    auth: AuthContext,
    query: { branchId?: string; scope: "mine" | "branch" },
  ): Promise<PaymentSummaryDto> {
    const branchId = requireBranch(auth, query.branchId);
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const scope = auth.role === "CASHIER" ? "mine" : query.scope;
    const date = todayIn(branch.timezone);
    const { start, end } = dayRange(date, branch.timezone);
    const mine = scope === "mine" ? { cashierId: auth.userId } : {};

    const [payments, refunds, openBills] = await Promise.all([
      prisma.payment.groupBy({
        by: ["method"],
        where: { branchId, createdAt: { gte: start, lt: end }, ...mine },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.refund.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          // Refunds of points payments return points, not money.
          payment: { branchId, ...mine, method: { not: "LOYALTY_POINTS" } },
        },
        _sum: { amount: true },
      }),
      prisma.order.count({ where: { branchId, status: { in: ["SERVED", "PAYMENT_REQUESTED"] } } }),
    ]);
    const byMethod = PAYMENT_METHODS.flatMap((method) => {
      const row = payments.find((p) => p.method === method);
      return row ? [{ method, count: row._count, total: Number(row._sum.amount ?? 0) }] : [];
    });
    // Points are a tender, not takings: they show in the breakdown but not in the money collected.
    const collected = money(
      byMethod
        .filter((m) => m.method !== "LOYALTY_POINTS")
        .reduce((sum, m) => sum + cents(m.total), 0),
    );
    const refunded = Number(refunds._sum.amount ?? 0);
    return {
      date,
      scope,
      currency: branch.currency,
      paymentCount: byMethod.reduce((sum, m) => sum + m.count, 0),
      collected,
      refunded,
      net: money(cents(collected) - cents(refunded)),
      byMethod,
      openBills,
    };
  },

  /** Restaurant charges posted to a guest's room, ready for the final bill at checkout. */
  async folio(auth: AuthContext, bookingId: string): Promise<FolioDto> {
    const booking = await prisma.roomBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw AppError.notFound("Booking not found.");
    assertBranchAccess(auth, booking.branchId);
    const [payments, branch] = await Promise.all([
      prisma.payment.findMany({
        where: { roomBookingId: bookingId, method: "ROOM_CHARGE" },
        include: {
          refunds: { select: { amount: true } },
          bill: { select: { billNumber: true, order: { select: { orderNumber: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.branch.findUniqueOrThrow({ where: { id: booking.branchId } }),
    ]);
    const charges = payments
      .map((p) => ({
        paymentId: p.id,
        orderNumber: p.bill.order.orderNumber,
        billNumber: p.bill.billNumber,
        amount: money(cents(p.amount) - p.refunds.reduce((s, r) => s + cents(r.amount), 0)),
        createdAt: p.createdAt.toISOString(),
      }))
      .filter((c) => c.amount > 0);
    return {
      bookingId,
      guestName: booking.guestName,
      currency: branch.currency,
      charges,
      total: money(charges.reduce((sum, c) => sum + cents(c.amount), 0)),
    };
  },
};
