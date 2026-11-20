export const PAYMENT_METHODS = [
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "MOBILE_PAYMENT",
  "BANK_TRANSFER",
  "ROOM_CHARGE",
  "LOYALTY_POINTS",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Credit card",
  DEBIT_CARD: "Debit card",
  MOBILE_PAYMENT: "Mobile payment",
  BANK_TRANSFER: "Bank transfer",
  ROOM_CHARGE: "Room charge",
  LOYALTY_POINTS: "Loyalty points",
};

export const BILL_STATUSES = ["OPEN", "PAID", "REFUNDED", "VOID"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  OPEN: "Open",
  PAID: "Paid",
  REFUNDED: "Refunded",
  VOID: "Void",
};

export const DISCOUNT_TYPES = ["PERCENT", "AMOUNT"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Cashiers may discount up to this share of the subtotal; anything larger needs a manager. */
export const CASHIER_DISCOUNT_MAX_PERCENT = 10;

/** Order statuses a bill can be raised for. */
export const BILLABLE_ORDER_STATUSES = ["SERVED", "PAYMENT_REQUESTED"] as const;
