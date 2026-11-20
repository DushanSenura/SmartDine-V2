import {
  maxRedeemablePoints,
  type BillDto,
  type BillLineDto,
  type PaymentDto,
  type PaymentMethod,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;
const num = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));

export const billInclude = {
  order: {
    include: {
      table: { select: { tableNumber: true } },
      room: { select: { roomNumber: true } },
      waiter: { select: { firstName: true, lastName: true } },
      items: {
        include: { modifiers: true },
        orderBy: [{ round: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }],
      },
    },
  },
  payments: {
    include: {
      cashier: { select: { firstName: true, lastName: true } },
      refunds: {
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" as const },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  receipt: { select: { id: true } },
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      loyaltyAccount: { select: { points: true } },
    },
  },
  promotion: { select: { name: true, code: true } },
} satisfies Prisma.BillInclude;

export type BillRecord = Prisma.BillGetPayload<{ include: typeof billInclude }>;
type PaymentRecord = BillRecord["payments"][number];

export const locationOf = (order: {
  table: { tableNumber: string } | null;
  room: { roomNumber: string } | null;
}) => (order.table ? `Table ${order.table.tableNumber}` : `Room ${order.room?.roomNumber ?? "?"}`);

export function billLines(order: BillRecord["order"]): BillLineDto[] {
  return order.items
    .filter((i) => i.status !== "CANCELLED")
    .map((i) => {
      const unitPrice = Number(i.unitPrice);
      return {
        name: i.name,
        quantity: i.quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * i.quantity * 100) / 100,
        modifiers: i.modifiers.map((m) => m.name),
        status: i.status,
      };
    });
}

export function toPaymentDto(
  payment: PaymentRecord,
  billNumber: string,
  orderNumber: string,
): PaymentDto {
  const refunds = payment.refunds.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    reason: r.reason,
    byName: fullName(r.user),
    createdAt: r.createdAt.toISOString(),
  }));
  return {
    id: payment.id,
    billId: payment.billId,
    billNumber,
    orderNumber,
    method: payment.method,
    amount: Number(payment.amount),
    tendered: num(payment.tendered),
    change: num(payment.changeGiven),
    reference: payment.reference,
    cashierName: fullName(payment.cashier),
    refundedAmount: Math.round(refunds.reduce((sum, r) => sum + r.amount, 0) * 100) / 100,
    refunds,
    createdAt: payment.createdAt.toISOString(),
  };
}

export interface LoyaltyRules {
  enabled: boolean;
  pointValue: number;
  discountLimitPercent: number;
  paymentMethods: PaymentMethod[];
}

export function toBillDto(
  bill: BillRecord,
  currency: string,
  loyalty: LoyaltyRules = {
    enabled: false,
    pointValue: 1,
    discountLimitPercent: 10,
    paymentMethods: ["CASH"],
  },
): BillDto {
  const total = Number(bill.total);
  const paidAmount = Number(bill.paidAmount);
  const points = bill.customer?.loyaltyAccount?.points ?? 0;
  const open = bill.status === "OPEN";
  return {
    id: bill.id,
    billNumber: bill.billNumber,
    branchId: bill.branchId,
    orderId: bill.orderId,
    orderNumber: bill.order.orderNumber,
    orderType: bill.order.type,
    orderStatus: bill.order.status,
    location: locationOf(bill.order),
    guestName: bill.order.guestName,
    status: bill.status,
    lines: billLines(bill.order),
    subtotal: Number(bill.subtotal),
    discountType: bill.discountType,
    discountValue: Number(bill.discountValue),
    discountAmount: Number(bill.discountAmount),
    discountReason: bill.discountReason,
    serviceChargePercent: Number(bill.serviceChargePercent),
    serviceChargeAmount: Number(bill.serviceChargeAmount),
    taxPercent: Number(bill.taxPercent),
    taxAmount: Number(bill.taxAmount),
    total,
    paidAmount,
    refundedAmount: Number(bill.refundedAmount),
    balance: Math.round((total - paidAmount) * 100) / 100,
    currency,
    roomBookingId: bill.roomBookingId,
    customer: bill.customer
      ? {
          id: bill.customer.id,
          name: `${bill.customer.firstName} ${bill.customer.lastName}`,
          email: bill.customer.email,
          points,
        }
      : null,
    promotionCode: bill.promotion?.code ?? null,
    promotionName: bill.promotion?.name ?? null,
    pointsEarned: bill.pointsEarned,
    loyalty: {
      enabled: loyalty.enabled,
      pointValue: loyalty.pointValue,
      maxRedeemablePoints:
        loyalty.enabled && open && bill.customer
          ? maxRedeemablePoints(
              points,
              Math.round((total - paidAmount) * 100) / 100,
              loyalty.pointValue,
            )
          : 0,
    },
    rules: {
      discountLimitPercent: loyalty.discountLimitPercent,
      paymentMethods: loyalty.paymentMethods,
    },
    payments: bill.payments.map((p) => toPaymentDto(p, bill.billNumber, bill.order.orderNumber)),
    receiptId: bill.receipt?.id ?? null,
    createdAt: bill.createdAt.toISOString(),
    paidAt: bill.paidAt?.toISOString() ?? null,
  };
}
