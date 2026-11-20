import { z } from "zod";

import {
  PROMOTION_TYPES,
  REVIEW_KINDS,
  REVIEW_STATUSES,
  type LoyaltyTransactionType,
  type PromotionType,
  type ReviewKind,
  type ReviewStatus,
} from "../constants/customers";
import type { BillStatus } from "../constants/payments";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const tags = z.array(text(60).min(1)).max(30);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

// ── Customers ─────────────────────────────────────────────────────

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const profileFields = {
  birthday: dateOnly.nullable().optional(),
  address: optionalText(300),
  preferences: optionalText(500),
  dietaryPreferences: tags.optional(),
  allergies: tags.optional(),
};

/** What staff may edit about a customer. */
export const updateCustomerSchema = z.object({
  firstName: text(60).min(1).optional(),
  lastName: text(60).min(1).optional(),
  phone: optionalText(40),
  ...profileFields,
  notes: optionalText(2000),
});

/** What a customer may edit about themselves (staff notes stay private). */
export const updateMyProfileSchema = z.object({ phone: optionalText(40), ...profileFields });

export const customerLookupQuerySchema = z.object({ q: z.string().trim().min(2).max(80) });

export const loyaltyAdjustSchema = z.object({
  points: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, "Enter a number of points")
    .refine((n) => Math.abs(n) <= 1_000_000, "Too many points"),
  note: text(200).min(3, "Give a reason"),
});

export const attachCustomerSchema = z.object({ customerId: z.uuid().nullable() });
export const redeemPointsSchema = z.object({ points: z.coerce.number().int().positive() });
export const applyPromoSchema = z.object({ code: text(40).min(1, "Enter a code") });

// ── Promotions ────────────────────────────────────────────────────

const promotionFields = {
  name: text(120).min(1, "Required"),
  description: optionalText(500),
  code: text(40)
    .transform((v) => v.toUpperCase())
    .pipe(
      z.union([
        z.literal(""),
        z.string().regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Letters, numbers, - and _ only"),
      ]),
    )
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  type: z.enum(PROMOTION_TYPES),
  value: z.coerce.number().min(0).max(10_000_000),
  startsOn: dateOnly.nullable().optional(),
  endsOn: dateOnly.nullable().optional(),
  minimumSpend: z.coerce.number().min(0).max(10_000_000),
  usageLimit: z.coerce.number().int().min(1).max(10_000_000).nullable().optional(),
  branchIds: z.array(z.uuid()).max(50),
  customerIds: z.array(z.uuid()).max(200),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7),
  startTime: time.nullable().optional(),
  endTime: time.nullable().optional(),
  active: z.boolean(),
};

function checkPromotion(
  v: {
    type?: PromotionType;
    value?: number;
    startsOn?: string | null;
    endsOn?: string | null;
    startTime?: string | null;
    endTime?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if ((v.type === "PERCENTAGE" || v.type === "HAPPY_HOUR") && (v.value ?? 0) > 100)
    issue("value", "A percentage can't exceed 100.");
  if (v.type === "LOYALTY_MULTIPLIER" && (v.value ?? 0) < 1)
    issue("value", "A multiplier must be at least 1.");
  if (
    (v.type === "PERCENTAGE" || v.type === "FIXED" || v.type === "HAPPY_HOUR") &&
    !(v.value && v.value > 0)
  )
    issue("value", "Enter the discount.");
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) issue("endsOn", "Ends before it starts.");
  if (!!v.startTime !== !!v.endTime) issue("endTime", "Give both a start and an end time.");
}

export const promotionSchema = z
  .object({
    ...promotionFields,
    value: promotionFields.value.default(0),
    minimumSpend: promotionFields.minimumSpend.default(0),
    branchIds: promotionFields.branchIds.default([]),
    customerIds: promotionFields.customerIds.default([]),
    daysOfWeek: promotionFields.daysOfWeek.default([]),
    active: promotionFields.active.default(true),
  })
  .superRefine(checkPromotion);
export const updatePromotionSchema = z
  .object(promotionFields)
  .partial()
  .superRefine(checkPromotion);

// ── Reviews ───────────────────────────────────────────────────────

export const createReviewSchema = z
  .object({
    kind: z.enum(REVIEW_KINDS),
    billId: z.uuid().optional(),
    bookingId: z.uuid().optional(),
    rating: z.coerce.number().int().min(1).max(5),
    comment: optionalText(1000),
  })
  .refine((v) => (v.kind === "DINING" ? !!v.billId && !v.bookingId : !!v.bookingId && !v.billId), {
    message: "A dining review needs a bill; a stay review needs a booking.",
    path: ["kind"],
  });

export const moderateReviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  response: optionalText(1000),
});

export const reviewListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  status: z.enum(REVIEW_STATUSES).optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
export type LoyaltyAdjustInput = z.infer<typeof loyaltyAdjustSchema>;
export type PromotionInput = z.infer<typeof promotionSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

// ── DTOs ──────────────────────────────────────────────────────────

export interface CustomerSummaryDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  points: number;
  visitCount: number;
  totalSpent: number;
  lastVisit: string | null;
  createdAt: string;
}

/** The little a cashier needs to attach a customer to a bill. */
export interface CustomerLookupDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  points: number;
}

export interface LoyaltyTransactionDto {
  id: string;
  type: LoyaltyTransactionType;
  points: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface LoyaltyAccountDto {
  enabled: boolean;
  points: number;
  lifetimePoints: number;
  currencyPerPoint: number;
  pointValue: number;
  currency: string;
  transactions: LoyaltyTransactionDto[];
}

export interface CustomerDetailDto extends CustomerSummaryDto {
  birthday: string | null;
  address: string | null;
  preferences: string | null;
  dietaryPreferences: string[];
  allergies: string[];
  notes: string | null;
  currency: string;
  loyalty: LoyaltyAccountDto;
  reservations: {
    id: string;
    reference: string;
    startsAt: string;
    status: string;
    partySize: number;
  }[];
  stays: {
    id: string;
    reference: string;
    checkIn: string;
    checkOut: string;
    status: string;
    total: number;
  }[];
  bills: {
    id: string;
    billNumber: string;
    total: number;
    status: BillStatus;
    paidAt: string | null;
  }[];
}

export interface PromotionDto {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  type: PromotionType;
  value: number;
  startsOn: string | null;
  endsOn: string | null;
  minimumSpend: number;
  usageLimit: number | null;
  usedCount: number;
  branchIds: string[];
  customerIds: string[];
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  active: boolean;
  /** Whether it can be used today (active, in its dates, under its limit). */
  live: boolean;
}

/** An offer as shown to guests (no codes, limits or customer lists). */
export interface PublicOfferDto {
  id: string;
  name: string;
  description: string | null;
  type: PromotionType;
  value: number;
  startsOn: string | null;
  endsOn: string | null;
  minimumSpend: number;
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
}

export interface ReviewDto {
  id: string;
  kind: ReviewKind;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  response: string | null;
  respondedAt: string | null;
  authorName: string;
  branchName: string;
  createdAt: string;
}

export interface ReviewSummaryDto {
  average: number | null;
  count: number;
  reviews: Pick<
    ReviewDto,
    "id" | "kind" | "rating" | "comment" | "response" | "authorName" | "createdAt"
  >[];
}

/** A paid bill or finished stay the customer can still review. */
export interface ReviewableDto {
  kind: ReviewKind;
  billId?: string;
  bookingId?: string;
  label: string;
  date: string;
}
