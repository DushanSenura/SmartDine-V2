import { z } from "zod";

import {
  BED_TYPES,
  EXTRA_PRICING_MODES,
  HOUSEKEEPING_STATUSES,
  HOUSEKEEPING_TASK_STATUSES,
  MANUAL_ROOM_STATUSES,
  ROOM_AMENITIES,
  ROOM_BOOKING_STATUSES,
  ROOM_RULES,
  ROOM_TYPE_STATUSES,
  type BedType,
  type ExtraPricingMode,
  type HousekeepingStatus,
  type HousekeepingTaskStatus,
  type RoomBookingStatus,
  type RoomPaymentStatus,
  type RoomStatus,
} from "../constants/rooms";
import { httpUrl } from "./common";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const money = z.coerce.number().min(0).max(10_000_000);

// ── Room types ───────────────────────────────────────────────────

export const createRoomTypeSchema = z.object({
  branchId: z.uuid(),
  name: text(80).min(1, "Required"),
  description: optionalText(3000),
  maximumGuests: z.coerce.number().int().min(1).max(12),
  bedType: z.enum(BED_TYPES),
  numberOfBeds: z.coerce.number().int().min(1).max(10),
  roomSize: z.coerce.number().int().min(5).max(1000).nullable().optional(),
  basePrice: money,
  /** Price for Friday and Saturday nights. Defaults to the base price. */
  weekendPrice: money.nullable().optional(),
  images: z.array(httpUrl).max(12).default([]),
  amenities: z.array(z.enum(ROOM_AMENITIES)).max(20).default([]),
  status: z.enum(ROOM_TYPE_STATUSES).default("ACTIVE"),
});
export const updateRoomTypeSchema = createRoomTypeSchema
  .omit({ branchId: true })
  .partial()
  // Re-declared without the create schema's defaults, which `.partial()` would otherwise keep: a
  // PATCH of just the name must not wipe the images and amenities or reactivate the type.
  .extend({
    weekendPrice: money.nullable().optional(),
    images: z.array(httpUrl).max(12).optional(),
    amenities: z.array(z.enum(ROOM_AMENITIES)).max(20).optional(),
    status: z.enum(ROOM_TYPE_STATUSES).optional(),
  });
export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>;

export interface RoomTypeDto {
  id: string;
  branchId: string;
  name: string;
  slug: string;
  description: string | null;
  maximumGuests: number;
  bedType: BedType;
  numberOfBeds: number;
  roomSize: number | null;
  basePrice: number;
  weekendPrice: number | null;
  images: string[];
  amenities: string[];
  status: "ACTIVE" | "INACTIVE";
  /** Staff views only: how many physical rooms of this type exist. */
  roomCount?: number;
}

// ── Rooms (physical inventory) ───────────────────────────────────

export const createRoomSchema = z.object({
  branchId: z.uuid(),
  roomTypeId: z.uuid(),
  roomNumber: text(16).min(1, "Required"),
  floor: z.coerce.number().int().min(-5).max(200).default(1),
  notes: optionalText(500),
});
export const updateRoomSchema = z.object({
  roomTypeId: z.uuid().optional(),
  roomNumber: text(16).min(1).optional(),
  floor: z.coerce.number().int().min(-5).max(200).optional(),
  notes: optionalText(500),
});
export const setRoomStatusSchema = z.object({ status: z.enum(MANUAL_ROOM_STATUSES) });
export const roomListQuerySchema = z.object({ branchId: z.uuid().optional() });
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export interface RoomDto {
  id: string;
  branchId: string;
  roomTypeId: string;
  roomTypeName: string;
  roomNumber: string;
  floor: number;
  status: RoomStatus;
  housekeepingStatus: HousekeepingStatus;
  notes: string | null;
  /** Derived: a confirmed arrival is due today in an otherwise available room. */
  reservedToday: boolean;
  /** Derived: name of the guest currently staying, if any. */
  currentGuest: string | null;
}

export interface RoomsOverviewDto {
  date: string;
  totalRooms: number;
  byStatus: Record<RoomStatus, number>;
  occupied: number;
  occupancyPercent: number;
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  dirtyRooms: number;
}

// ── Extras ───────────────────────────────────────────────────────

export const createExtraSchema = z.object({
  branchId: z.uuid(),
  name: text(80).min(1, "Required"),
  description: optionalText(300),
  price: money,
  pricingMode: z.enum(EXTRA_PRICING_MODES).default("PER_STAY"),
  isActive: z.boolean().default(true),
});
export const updateExtraSchema = createExtraSchema
  .omit({ branchId: true })
  .partial()
  .extend({
    pricingMode: z.enum(EXTRA_PRICING_MODES).optional(),
    isActive: z.boolean().optional(),
  });
export type CreateExtraInput = z.infer<typeof createExtraSchema>;

export interface RoomExtraDto {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  price: number;
  pricingMode: ExtraPricingMode;
  isActive: boolean;
}

// ── Availability & quotes ────────────────────────────────────────

const stayFields = {
  branchId: z.uuid(),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.coerce.number().int().min(1).max(ROOM_RULES.maxGuestsPerBooking),
  children: z.coerce.number().int().min(0).max(ROOM_RULES.maxGuestsPerBooking).default(0),
};

export const roomAvailabilityQuerySchema = z.object(stayFields);
export type RoomAvailabilityQuery = z.infer<typeof roomAvailabilityQuerySchema>;

export interface NightlyRate {
  date: string;
  price: number;
}

export interface StayQuote {
  nights: number;
  nightly: NightlyRate[];
  roomSubtotal: number;
  extrasTotal: number;
  taxRatePercent: number;
  depositPercent: number;
  taxes: number;
  discount: number;
  total: number;
  /** Portion payable to secure the booking. */
  deposit: number;
  currency: string;
}

export interface AvailableRoomType {
  roomType: RoomTypeDto;
  /** Physical rooms free for the whole stay. */
  available: number;
  quote: StayQuote;
}

export interface RoomAvailabilityDto {
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  checkInTime: string;
  checkOutTime: string;
  results: AvailableRoomType[];
}

// ── Bookings ─────────────────────────────────────────────────────

const contactFields = {
  guestName: z.string().trim().min(1, "Required").max(120),
  guestEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  guestPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number"),
};

const bookingFields = {
  ...stayFields,
  roomTypeId: z.uuid(),
  extras: z
    .array(
      z.object({ extraId: z.uuid(), quantity: z.coerce.number().int().min(1).max(20).default(1) }),
    )
    .max(20)
    .default([]),
  additionalGuests: z
    .array(z.object({ name: text(120).min(1), isChild: z.boolean().default(false) }))
    .max(11)
    .default([]),
  specialRequests: optionalText(1000),
  ...contactFields,
};

export const createRoomBookingSchema = z.object(bookingFields);
/** Phone / walk-in booking by staff; may pin a specific physical room. */
export const createStaffRoomBookingSchema = z.object({
  ...bookingFields,
  roomId: z.uuid().optional(),
});
export const updateRoomBookingStatusSchema = z.object({
  status: z.enum(ROOM_BOOKING_STATUSES),
  reason: optionalText(300),
});
export const assignRoomSchema = z.object({ roomId: z.uuid() });
export const roomBookingListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  status: z.enum(ROOM_BOOKING_STATUSES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type CreateRoomBookingInput = z.infer<typeof createRoomBookingSchema>;
export type CreateStaffRoomBookingInput = z.infer<typeof createStaffRoomBookingSchema>;

export interface RoomBookingDto {
  id: string;
  reference: string;
  status: RoomBookingStatus;
  paymentStatus: RoomPaymentStatus;
  branchId: string;
  branchName: string;
  timezone: string;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  extras: { name: string; quantity: number; total: number }[];
  additionalGuests: { name: string; isChild: boolean }[];
  roomSubtotal: number;
  extrasTotal: number;
  taxes: number;
  discount: number;
  total: number;
  deposit: number;
  specialRequests: string | null;
  checkInTime: string;
  checkOutTime: string;
  currency: string;
  canCancel: boolean;
  cancellableUntil: string | null;
  createdAt: string;
}

// ── Housekeeping ─────────────────────────────────────────────────

export const housekeepingUpdateSchema = z.object({
  housekeepingStatus: z.enum(HOUSEKEEPING_STATUSES),
  notes: optionalText(500),
});
export const taskUpdateSchema = z.object({
  status: z.enum(HOUSEKEEPING_TASK_STATUSES).optional(),
  assignedToId: z.uuid().nullable().optional(),
  notes: optionalText(500),
});
export const taskListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  status: z.enum(HOUSEKEEPING_TASK_STATUSES).optional(),
});

export interface HousekeepingTaskDto {
  id: string;
  roomId: string;
  roomNumber: string;
  type: "CHECKOUT_CLEAN" | "ROUTINE" | "MAINTENANCE";
  status: HousekeepingTaskStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}
