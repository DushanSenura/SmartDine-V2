import { z } from "zod";

import {
  DISCOUNT_TYPES,
  PAYMENT_METHODS,
  type BillStatus,
  type DiscountType,
  type PaymentMethod,
} from "../constants/payments";
import type { OrderItemStatus, OrderStatus, OrderType } from "../constants/orders";

const money = z.coerce.number().min(0).max(10_000_000);

export const createBillSchema = z.object({ orderId: z.uuid() });

export const applyDiscountSchema = z
  .object({
    type: z.enum(DISCOUNT_TYPES),
    value: money,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.value === 0 || (v.reason?.length ?? 0) >= 3, {
    message: "Give a reason for the discount.",
    path: ["reason"],
  })
  .refine((v) => v.type !== "PERCENT" || v.value <= 100, {
    message: "A percentage discount can't exceed 100%.",
    path: ["value"],
  });

export const payBillSchema = z
  .object({
    /** Points are only spent through the dedicated redeem endpoint, never typed in as a method. */
    method: z.enum(PAYMENT_METHODS).exclude(["LOYALTY_POINTS"]),
    /** The part of the bill this payment settles. */
    amount: z.coerce.number().positive().max(10_000_000),
    /** Cash handed over; only for CASH. */
    tendered: money.optional(),
    /** Card approval code, transfer reference, wallet transaction id… */
    reference: z
      .string()
      .trim()
      .max(60)
      .regex(/^[\w .#/-]*$/, "Use letters, numbers and - . # / only")
      .optional(),
  })
  .refine((v) => v.method === "CASH" || v.tendered === undefined, {
    message: "Only cash payments have an amount tendered.",
    path: ["tendered"],
  })
  .refine((v) => v.tendered === undefined || v.tendered >= v.amount, {
    message: "The cash handed over is less than the amount.",
    path: ["tendered"],
  });

export const refundSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  reason: z.string().trim().min(3, "Give a reason for the refund.").max(300),
});

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const paymentListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
});

export const paymentSummaryQuerySchema = z.object({
  branchId: z.uuid().optional(),
  /** `mine` = the signed-in cashier's shift; `branch` = everyone's (managers). */
  scope: z.enum(["mine", "branch"]).default("mine"),
});

export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>;
export type PayBillInput = z.infer<typeof payBillSchema>;
export type RefundInput = z.infer<typeof refundSchema>;

export interface BillLineDto {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: string[];
  status: OrderItemStatus;
}

export interface RefundDto {
  id: string;
  amount: number;
  reason: string;
  byName: string;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  billId: string;
  billNumber: string;
  orderNumber: string;
  method: PaymentMethod;
  amount: number;
  tendered: number | null;
  change: number | null;
  reference: string | null;
  cashierName: string;
  refundedAmount: number;
  refunds: RefundDto[];
  createdAt: string;
}

export interface BillDto {
  id: string;
  billNumber: string;
  branchId: string;
  orderId: string;
  orderNumber: string;
  orderType: OrderType;
  orderStatus: OrderStatus;
  location: string;
  guestName: string | null;
  status: BillStatus;
  lines: BillLineDto[];
  subtotal: number;
  discountType: DiscountType | null;
  discountValue: number;
  discountAmount: number;
  discountReason: string | null;
  serviceChargePercent: number;
  serviceChargeAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  refundedAmount: number;
  /** What is still owed. */
  balance: number;
  currency: string;
  roomBookingId: string | null;
  /** The customer account attached to this bill (earns and spends loyalty points). */
  customer: { id: string; name: string; email: string; points: number } | null;
  promotionCode: string | null;
  promotionName: string | null;
  pointsEarned: number;
  loyalty: { enabled: boolean; pointValue: number; maxRedeemablePoints: number };
  /** What the till accepts and how far a cashier may discount, from company settings. */
  rules: { discountLimitPercent: number; paymentMethods: PaymentMethod[] };
  payments: PaymentDto[];
  receiptId: string | null;
  createdAt: string;
  paidAt: string | null;
}

/** An order waiting for the cashier, with its bill once one exists. */
export interface BillQueueItemDto {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  location: string;
  waiterName: string;
  subtotal: number;
  currency: string;
  requestedAt: string | null;
  billId: string | null;
  total: number | null;
  paidAmount: number;
}

export interface ReceiptDto {
  id: string;
  receiptNumber: string;
  billNumber: string;
  issuedAt: string;
  timezone: string;
  branch: { name: string; address: string | null; phone: string | null; email: string | null };
  company: string;
  orderNumber: string;
  location: string;
  guestName: string | null;
  waiterName: string;
  cashierName: string;
  lines: BillLineDto[];
  subtotal: number;
  discountAmount: number;
  discountReason: string | null;
  serviceChargePercent: number;
  serviceChargeAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  payments: {
    method: PaymentMethod;
    amount: number;
    tendered: number | null;
    change: number | null;
    reference: string | null;
  }[];
  refundedAmount: number;
  currency: string;
  footer: string | null;
}

export interface PaymentSummaryDto {
  date: string;
  scope: "mine" | "branch";
  currency: string;
  paymentCount: number;
  collected: number;
  refunded: number;
  net: number;
  byMethod: { method: PaymentMethod; count: number; total: number }[];
  openBills: number;
}

export interface FolioDto {
  bookingId: string;
  guestName: string;
  currency: string;
  charges: {
    paymentId: string;
    orderNumber: string;
    billNumber: string;
    amount: number;
    createdAt: string;
  }[];
  total: number;
}
