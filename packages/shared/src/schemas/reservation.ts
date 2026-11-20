import { z } from "zod";

import {
  OCCASIONS,
  RESERVATION_RULES,
  RESERVATION_STATUSES,
  RESERVATION_TYPES,
  type Occasion,
  type ReservationStatus,
  type ReservationType,
} from "../constants/reservations";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

const guests = z.coerce.number().int().min(1, "At least 1 guest").max(RESERVATION_RULES.maxGuests);

const contactFields = {
  guestName: z.string().trim().min(1, "Required").max(120),
  guestEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  guestPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number"),
};

// ── Availability ─────────────────────────────────────────────────

export const availabilityQuerySchema = z.object({
  branchId: z.uuid(),
  date: isoDate,
  guests,
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export interface AvailableArea {
  id: string;
  name: string;
  /** Number of suitable free tables (not a promise: the table is assigned at booking time). */
  tables: number;
}

export interface AvailabilitySlot {
  /** Branch-local time, HH:mm. */
  time: string;
  available: boolean;
  areas: AvailableArea[];
}

export interface AvailabilityDto {
  date: string;
  guests: number;
  durationMinutes: number;
  timezone: string;
  /** Empty when the branch is closed that day. */
  slots: AvailabilitySlot[];
  closed: boolean;
}

export const privateAvailabilityQuerySchema = z.object({ roomId: z.uuid(), date: isoDate });

export interface PrivateAvailabilityDto {
  roomId: string;
  date: string;
  timezone: string;
  closed: boolean;
  /** Bookable window, branch-local HH:mm. */
  opens: string | null;
  closes: string | null;
  /** Existing bookings that day, branch-local HH:mm. */
  busy: { start: string; end: string }[];
}

// ── Creating reservations ────────────────────────────────────────

export const createReservationSchema = z.object({
  branchId: z.uuid(),
  date: isoDate,
  time,
  partySize: guests,
  diningAreaId: z.uuid().optional(),
  specialRequest: optionalText(500),
  ...contactFields,
});

export const createPrivateReservationSchema = z.object({
  roomId: z.uuid(),
  date: isoDate,
  time,
  durationMinutes: z.coerce
    .number()
    .int()
    .min(RESERVATION_RULES.privateMinMinutes)
    .max(RESERVATION_RULES.privateMaxMinutes)
    .refine((v) => v % 30 === 0, "Use 30-minute steps"),
  partySize: guests,
  occasion: z.enum(OCCASIONS),
  specialRequest: optionalText(1000),
  ...contactFields,
});

/** Staff-entered bookings (phone / walk-in). Optionally pins a specific table. */
export const createStaffReservationSchema = createReservationSchema.extend({
  tableId: z.uuid().optional(),
});

export const updateReservationStatusSchema = z.object({
  status: z.enum(RESERVATION_STATUSES),
  reason: optionalText(300),
});

export const reservationListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  date: isoDate.optional(),
  /** Everything that hasn't ended yet, across all dates (ignored when `date` is given). */
  upcoming: z.enum(["true", "false"]).optional(),
  status: z.enum(RESERVATION_STATUSES).optional(),
  type: z.enum(RESERVATION_TYPES).optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type CreatePrivateReservationInput = z.infer<typeof createPrivateReservationSchema>;
export type CreateStaffReservationInput = z.infer<typeof createStaffReservationSchema>;
export type UpdateReservationStatusInput = z.infer<typeof updateReservationStatusSchema>;

export interface ReservationDto {
  id: string;
  reference: string;
  type: ReservationType;
  status: ReservationStatus;
  branchId: string;
  branchName: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  specialRequest: string | null;
  occasion: Occasion | null;
  tableId: string | null;
  tableNumber: string | null;
  areaName: string | null;
  roomName: string | null;
  depositAmount: number | null;
  estimatedCost: number | null;
  /** Customer may still cancel online. */
  canCancel: boolean;
  /** ISO time until which free online cancellation is allowed. */
  cancellableUntil: string | null;
}
