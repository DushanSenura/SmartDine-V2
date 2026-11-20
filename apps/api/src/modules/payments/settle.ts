import { pointsForBill, type ReceiptDto } from "@smartdine/shared";

import { AppError } from "../../shared/errors/AppError";
import { postPoints } from "../customers/loyalty";
import { record } from "../orders/order.service";
import { bestMultiplier } from "../promotions/promotion.rules";
import { receiptNumberFor, type Tx } from "./numbering";
import { billInclude, billLines, locationOf } from "./payment.mapper";

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

/**
 * Closes out a fully paid bill in the caller's transaction: the bill is PAID, the order goes
 * PAID → COMPLETED, an immutable receipt is issued, and the table (if the order was the last open
 * one) moves to CLEANING. Returns the table that changed so the caller can publish it.
 */
export async function settleBill(tx: Tx, billId: string, cashierId: string) {
  const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, include: billInclude });
  const now = new Date();

  await tx.bill.update({ where: { id: billId }, data: { status: "PAID", paidAt: now } });

  const { count } = await tx.order.updateMany({
    where: { id: bill.orderId, status: { in: ["SERVED", "PAYMENT_REQUESTED"] } },
    data: { status: "COMPLETED" },
  });
  if (count === 0) {
    throw AppError.conflict("ORDER_NOT_BILLABLE", "The order changed while the payment was taken.");
  }
  await record(
    tx,
    bill.orderId,
    cashierId,
    bill.order.status,
    "PAID",
    `Bill ${bill.billNumber} paid`,
  );
  await record(tx, bill.orderId, cashierId, "PAID", "COMPLETED", null);

  const [branch, company, settings, cashier] = await Promise.all([
    tx.branch.findUniqueOrThrow({ where: { id: bill.branchId } }),
    tx.company.findFirstOrThrow({ where: { deletedAt: null } }),
    tx.companySettings.findFirst(),
    tx.user.findUniqueOrThrow({
      where: { id: cashierId },
      select: { firstName: true, lastName: true },
    }),
  ]);
  const receiptNumber = receiptNumberFor(bill.order.orderNumber);

  const data: Omit<ReceiptDto, "id"> = {
    receiptNumber,
    billNumber: bill.billNumber,
    issuedAt: now.toISOString(),
    timezone: branch.timezone,
    branch: {
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      email: branch.email,
    },
    company: company.name,
    orderNumber: bill.order.orderNumber,
    location: locationOf(bill.order),
    guestName: bill.order.guestName,
    waiterName: fullName(bill.order.waiter),
    cashierName: fullName(cashier),
    lines: billLines(bill.order),
    subtotal: Number(bill.subtotal),
    discountAmount: Number(bill.discountAmount),
    discountReason: bill.discountReason,
    serviceChargePercent: Number(bill.serviceChargePercent),
    serviceChargeAmount: Number(bill.serviceChargeAmount),
    taxPercent: Number(bill.taxPercent),
    taxAmount: Number(bill.taxAmount),
    total: Number(bill.total),
    payments: bill.payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      tendered: p.tendered === null ? null : Number(p.tendered),
      change: p.changeGiven === null ? null : Number(p.changeGiven),
      reference: p.reference,
    })),
    refundedAmount: 0,
    currency: bill.currency,
    footer: settings?.receiptFooter ?? null,
  };
  await tx.receipt.create({
    data: {
      billId,
      branchId: bill.branchId,
      receiptNumber,
      issuedAt: now,
      data: data as unknown as object,
    },
  });

  // Loyalty: points are earned on what was paid with real money, never on points spent.
  if (bill.customerId && settings?.loyaltyEnabled) {
    const spentInPoints = bill.payments
      .filter((p) => p.method === "LOYALTY_POINTS")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const base = Math.max(0, Number(bill.total) - spentInPoints);
    const multiplier = await bestMultiplier(tx, {
      branchId: bill.branchId,
      customerId: bill.customerId,
      subtotal: Number(bill.subtotal),
      timezone: branch.timezone,
    });
    const earned = pointsForBill(base, Number(settings.loyaltyCurrencyPerPoint), multiplier);
    if (earned > 0) {
      await postPoints(tx, bill.customerId, "EARN", earned, {
        billId,
        note:
          multiplier > 1
            ? `Bill ${bill.billNumber} · ${multiplier}x points`
            : `Bill ${bill.billNumber}`,
        staffId: cashierId,
      });
      await tx.bill.update({ where: { id: billId }, data: { pointsEarned: earned } });
    }
  }

  // The guests have paid and left: free the table for cleaning unless another order is still open.
  let tableId: string | null = null;
  if (bill.order.tableId) {
    const open = await tx.order.count({
      where: {
        tableId: bill.order.tableId,
        id: { not: bill.orderId },
        status: { notIn: ["COMPLETED", "PAID", "CANCELLED", "VOID", "REFUNDED"] },
      },
    });
    const table = await tx.restaurantTable.findUnique({ where: { id: bill.order.tableId } });
    if (open === 0 && table && table.status !== "OUT_OF_SERVICE" && table.status !== "CLEANING") {
      await tx.restaurantTable.update({ where: { id: table.id }, data: { status: "CLEANING" } });
      tableId = table.id;
    }
  }
  return { tableId };
}
