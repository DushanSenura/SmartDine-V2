import { z } from "zod";

import {
  AUDIT_ENTITIES,
  REPORT_GROUPS,
  REPORT_TYPES,
  type NotificationType,
  type ReportFormat,
  type ReportGroup,
  type ReportType,
} from "../constants/system";
import type { PaymentMethod } from "../constants/payments";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// ── Notifications ─────────────────────────────────────────────────

export const notificationListQuerySchema = z.object({
  unread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationListDto {
  unreadCount: number;
  notifications: NotificationDto[];
}

// ── Audit ─────────────────────────────────────────────────────────

export const auditQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  entity: z.enum(AUDIT_ENTITIES).optional(),
  action: z.string().trim().max(60).optional(),
  userId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export interface AuditEntryDto {
  id: string;
  userId: string | null;
  userName: string | null;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  branchId: string | null;
  previousValue: unknown;
  newValue: unknown;
  ip: string | null;
  createdAt: string;
}

// ── Dashboard ─────────────────────────────────────────────────────

export const dashboardQuerySchema = z.object({
  branchId: z.uuid().optional(),
  days: z.coerce.number().int().min(1).max(90).default(14),
});

export interface DashboardDto {
  scope: {
    /** Null when an owner is looking at every branch. */
    branchId: string | null;
    name: string;
    currency: string;
    timezone: string;
    days: number;
    today: string;
  };
  cards: {
    revenueToday: number;
    ordersToday: number;
    averageOrderValue: number;
    activeTables: number;
    totalTables: number;
    reservationsToday: number;
    roomOccupancyPercent: number;
    roomsOccupied: number;
    roomsTotal: number;
    roomsAvailable: number;
    kitchenAverageMinutes: number | null;
    customersToday: number;
    lowStockItems: number;
  };
  revenueTrend: { date: string; revenue: number; orders: number }[];
  salesByCategory: { category: string; revenue: number }[];
  popularItems: { name: string; quantity: number; revenue: number }[];
  paymentMethods: { method: PaymentMethod; total: number; count: number }[];
  hourlySales: { hour: number; revenue: number }[];
  occupancyTrend: { date: string; occupancyPercent: number }[];
  /** ISO weekday 1 (Mon) – 7 (Sun). */
  reservationPatterns: { weekday: number; count: number }[];
  /** Owners looking at every branch only. */
  branchComparison:
    | {
        branchId: string;
        name: string;
        revenue: number;
        orders: number;
        occupancyPercent: number;
      }[]
    | null;
}

// ── Reports ───────────────────────────────────────────────────────

export const reportQuerySchema = z.object({
  branchId: z.uuid().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  group: z.enum(REPORT_GROUPS).default("day"),
  format: z.enum(["json", "csv", "pdf"]).default("json"),
});

export const reportParamSchema = z.object({ type: z.enum(REPORT_TYPES) });

export interface ReportColumn {
  key: string;
  label: string;
  format: ReportFormat;
}

export type ReportCell = string | number | null;

export interface ReportDto {
  type: ReportType;
  title: string;
  /** Where the numbers come from, e.g. the branch and dates. */
  subtitle: string;
  currency: string;
  from: string;
  to: string;
  group: ReportGroup;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  totals: Record<string, ReportCell> | null;
  /** True when the row cap cut the list short. */
  truncated: boolean;
  generatedAt: string;
}

// ── Search ────────────────────────────────────────────────────────

export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "Type at least 2 characters")
    .max(80)
    // PostgreSQL text can't hold a NUL byte; refuse it instead of failing in the query.
    .refine((value) => !value.includes(String.fromCharCode(0)), "Invalid characters"),
  branchId: z.uuid().optional(),
});

export const SEARCH_KINDS = [
  "order",
  "reservation",
  "room-booking",
  "customer",
  "menu-item",
  "table",
  "staff",
  "room",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchResultDto {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  /** In-app path to open. */
  link: string;
}
