import { z } from "zod";

import { httpUrl } from "./common";

import {
  BRANCH_STATUSES,
  EMPLOYMENT_STATUSES,
  TABLE_SHAPES,
  TABLE_STATUSES,
  WEEK_DAYS,
} from "../constants/restaurant";
import { createStaffUserSchema, passwordSchema } from "./auth";

const text = (max = 200) => z.string().trim().max(max);
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const money = z.coerce.number().min(0).max(10_000_000);

// ── Opening hours ────────────────────────────────────────────────

const dayHoursSchema = z
  .object({ open: time, close: time })
  .refine((v) => v.open !== v.close, "Opening and closing time must differ")
  .nullable(); // null = closed

export const openingHoursSchema = z.object(
  Object.fromEntries(WEEK_DAYS.map((day) => [day, dayHoursSchema.optional()])) as Record<
    (typeof WEEK_DAYS)[number],
    z.ZodOptional<typeof dayHoursSchema>
  >,
);
export type OpeningHours = z.infer<typeof openingHoursSchema>;

// ── Company & settings ───────────────────────────────────────────

export const updateCompanySchema = z.object({
  name: text(120).min(1).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code")
    .optional(),
  timezone: text(64).min(1).optional(),
  logoUrl: httpUrl.nullable().optional(),
  address: optionalText(300),
  phone: optionalText(30),
  email: z.email().nullable().optional(),
});

export const updateCompanySettingsSchema = z.object({
  taxRatePercent: z.coerce.number().min(0).max(100).optional(),
  serviceChargePercent: z.coerce.number().min(0).max(100).optional(),
  reservationDurationMinutes: z.coerce.number().int().min(15).max(480).optional(),
  cancellationWindowHours: z.coerce.number().int().min(0).max(720).optional(),
  receiptFooter: optionalText(500),
  roomDepositPercent: z.coerce.number().min(0).max(100).optional(),
  checkInTime: time.optional(),
  checkOutTime: time.optional(),
  loyaltyEnabled: z.boolean().optional(),
  loyaltyCurrencyPerPoint: z.coerce.number().min(1).max(1_000_000).optional(),
  loyaltyPointValue: z.coerce.number().min(0).max(100_000).optional(),
  cashierDiscountLimitPercent: z.coerce.number().min(0).max(100).optional(),
  enabledPaymentMethods: z
    .array(
      z.enum([
        "CASH",
        "CREDIT_CARD",
        "DEBIT_CARD",
        "MOBILE_PAYMENT",
        "BANK_TRANSFER",
        "ROOM_CHARGE",
      ]),
    )
    .min(1, "Keep at least one payment method")
    .optional(),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;

// ── Branches ─────────────────────────────────────────────────────

export const createBranchSchema = z.object({
  name: text(120).min(1, "Required"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,16}$/, "2–16 letters, digits or dashes"),
  status: z.enum(BRANCH_STATUSES).optional(),
  address: optionalText(300),
  city: optionalText(80),
  phone: optionalText(30),
  email: z.email().nullable().optional(),
  timezone: text(64).min(1).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  openingHours: openingHoursSchema.nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  managerId: z.uuid().nullable().optional(),
});
export const updateBranchSchema = createBranchSchema.partial();

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export interface BranchDto {
  id: string;
  name: string;
  code: string;
  status: (typeof BRANCH_STATUSES)[number];
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
  openingHours: OpeningHours | null;
  latitude: number | null;
  longitude: number | null;
  managerId: string | null;
  managerName: string | null;
}

// ── Staff ────────────────────────────────────────────────────────

const staffProfileFields = {
  employeeId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,32}$/, "3–32 letters, digits or dashes")
    .optional(),
  address: optionalText(300),
  dateOfBirth: isoDate.nullable().optional(),
  department: optionalText(80),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  hireDate: isoDate.nullable().optional(),
  profileImageUrl: httpUrl.nullable().optional(),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalText(30),
};

export const createStaffSchema = createStaffUserSchema
  .omit({ branchId: true })
  .extend({ branchId: z.uuid(), ...staffProfileFields });

export const updateStaffSchema = z.object({
  firstName: text(80).min(1).optional(),
  lastName: text(80).min(1).optional(),
  phone: optionalText(30),
  branchId: z.uuid().optional(),
  role: createStaffUserSchema.shape.role.optional(),
  password: passwordSchema.optional(),
  ...staffProfileFields,
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export interface StaffDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  branchId: string | null;
  status: "ACTIVE" | "DISABLED";
  employeeId: string | null;
  address: string | null;
  dateOfBirth: string | null;
  department: string | null;
  employmentStatus: (typeof EMPLOYMENT_STATUSES)[number] | null;
  hireDate: string | null;
  profileImageUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

// ── Shifts, schedule & attendance ────────────────────────────────

export const createShiftSchema = z.object({
  name: text(60).min(1, "Required"),
  startTime: time,
  endTime: time,
});
export const updateShiftSchema = createShiftSchema.partial();

export const scheduleEntrySchema = z
  .object({
    userId: z.uuid(),
    branchId: z.uuid(),
    date: isoDate,
    shiftId: z.uuid().nullable().optional(),
    dayOff: z.boolean().default(false),
  })
  .refine((v) => v.dayOff !== !!v.shiftId, "Choose either a shift or a day off");

export const scheduleQuerySchema = z.object({
  branchId: z.uuid(),
  from: isoDate,
  to: isoDate,
});

export const attendanceQuerySchema = z.object({ branchId: z.uuid(), date: isoDate });

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type ScheduleEntryInput = z.infer<typeof scheduleEntrySchema>;

export interface ShiftDto {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}
export interface ScheduledShiftDto {
  id: string;
  userId: string;
  branchId: string;
  date: string;
  shiftId: string | null;
  dayOff: boolean;
}
export interface AttendanceDto {
  id: string;
  userId: string;
  userName: string;
  branchId: string;
  clockInAt: string;
  clockOutAt: string | null;
}

// ── Dining areas, tables & floor plan ────────────────────────────

export const createDiningAreaSchema = z.object({
  branchId: z.uuid(),
  name: text(80).min(1, "Required"),
  floor: z.coerce.number().int().min(-5).max(100).default(1),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  width: z.coerce.number().int().min(400).max(4000).optional(),
  height: z.coerce.number().int().min(300).max(4000).optional(),
  isActive: z.boolean().optional(),
});
export const updateDiningAreaSchema = createDiningAreaSchema
  .omit({ branchId: true })
  .partial()
  .extend({ floor: z.coerce.number().int().min(-5).max(100).optional() });

export const createTableSchema = z.object({
  branchId: z.uuid(),
  diningAreaId: z.uuid(),
  tableNumber: text(16).min(1, "Required"),
  name: optionalText(60),
  section: optionalText(60),
  capacity: z.coerce.number().int().min(1).max(50),
  shape: z.enum(TABLE_SHAPES).optional(),
  positionX: z.coerce.number().int().min(0).max(4000).optional(),
  positionY: z.coerce.number().int().min(0).max(4000).optional(),
  width: z.coerce.number().int().min(40).max(600).optional(),
  height: z.coerce.number().int().min(40).max(600).optional(),
  assignedWaiterId: z.uuid().nullable().optional(),
  notes: optionalText(500),
});
export const updateTableSchema = createTableSchema
  .omit({ branchId: true })
  .partial()
  .extend({ status: z.enum(TABLE_STATUSES).optional() });

export const updateTableStatusSchema = z.object({ status: z.enum(TABLE_STATUSES) });

export const saveLayoutSchema = z.object({
  tables: z
    .array(
      z.object({
        id: z.uuid(),
        diningAreaId: z.uuid().optional(),
        positionX: z.coerce.number().int().min(0).max(4000),
        positionY: z.coerce.number().int().min(0).max(4000),
        width: z.coerce.number().int().min(40).max(600),
        height: z.coerce.number().int().min(40).max(600),
      }),
    )
    .min(1)
    .max(500),
});

export const assignWaiterSchema = z.object({
  tableIds: z.array(z.uuid()).min(1).max(500),
  waiterId: z.uuid().nullable(),
});

export const branchQuerySchema = z.object({ branchId: z.uuid().optional() });

export type CreateDiningAreaInput = z.infer<typeof createDiningAreaSchema>;
export type UpdateDiningAreaInput = z.infer<typeof updateDiningAreaSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>;

export interface DiningAreaDto {
  id: string;
  branchId: string;
  name: string;
  floor: number;
  sortOrder: number;
  width: number;
  height: number;
  isActive: boolean;
}

export interface TableDto {
  id: string;
  branchId: string;
  diningAreaId: string;
  tableNumber: string;
  name: string | null;
  section: string | null;
  capacity: number;
  status: (typeof TABLE_STATUSES)[number];
  shape: (typeof TABLE_SHAPES)[number];
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  assignedWaiterId: string | null;
  assignedWaiterName: string | null;
  notes: string | null;
}

// ── Private dining rooms ─────────────────────────────────────────

export const createPrivateRoomSchema = z
  .object({
    branchId: z.uuid(),
    name: text(80).min(1, "Required"),
    description: optionalText(2000),
    capacity: z.coerce.number().int().min(1).max(500),
    minimumGuests: z.coerce.number().int().min(1).max(500).default(1),
    maximumGuests: z.coerce.number().int().min(1).max(500),
    images: z.array(httpUrl).max(12).default([]),
    amenities: z.array(text(60).min(1)).max(30).default([]),
    minimumSpend: money.default(0),
    hourlyRate: money.default(0),
    deposit: money.default(0),
    openingTimes: openingHoursSchema.nullable().optional(),
    specialRules: optionalText(2000),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.minimumGuests <= v.maximumGuests, {
    path: ["minimumGuests"],
    message: "Cannot exceed maximum guests",
  })
  .refine((v) => v.maximumGuests <= v.capacity, {
    path: ["maximumGuests"],
    message: "Cannot exceed capacity",
  });
export const updatePrivateRoomSchema = z.object({
  name: text(80).min(1).optional(),
  description: optionalText(2000),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  minimumGuests: z.coerce.number().int().min(1).max(500).optional(),
  maximumGuests: z.coerce.number().int().min(1).max(500).optional(),
  images: z.array(httpUrl).max(12).optional(),
  amenities: z.array(text(60).min(1)).max(30).optional(),
  minimumSpend: money.optional(),
  hourlyRate: money.optional(),
  deposit: money.optional(),
  openingTimes: openingHoursSchema.nullable().optional(),
  specialRules: optionalText(2000),
  isActive: z.boolean().optional(),
});

export type CreatePrivateRoomInput = z.infer<typeof createPrivateRoomSchema>;
export type UpdatePrivateRoomInput = z.infer<typeof updatePrivateRoomSchema>;

export interface PrivateRoomDto {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  capacity: number;
  minimumGuests: number;
  maximumGuests: number;
  images: string[];
  amenities: string[];
  minimumSpend: number;
  hourlyRate: number;
  deposit: number;
  openingTimes: OpeningHours | null;
  specialRules: string | null;
  isActive: boolean;
}
