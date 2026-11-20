import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { requireBranch } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { localToUtc } from "../reservations/reservation.timing";

export interface Scope {
  branchIds: string[];
  /** Null when an owner is looking at every branch. */
  branchId: string | null;
  names: Map<string, string>;
  name: string;
  currency: string;
  timezone: string;
}

/**
 * Which branches a figure covers. A manager is always their own branch; an owner picks one or, with
 * none chosen, sees the whole company (in the company's timezone and currency).
 */
export async function resolveScope(auth: AuthContext, requested?: string): Promise<Scope> {
  const company = await prisma.company.findFirst({ where: { deletedAt: null } });
  if (!company) throw AppError.notFound("Company has not been set up.");

  if (auth.role === "OWNER" && !requested) {
    const branches = await prisma.branch.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return {
      branchIds: branches.map((b) => b.id),
      branchId: null,
      names: new Map(branches.map((b) => [b.id, b.name])),
      name: "All branches",
      currency: company.currency,
      timezone: company.timezone,
    };
  }
  const branchId = requireBranch(auth, requested);
  const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
  if (!branch) throw AppError.notFound("Branch not found.");
  return {
    branchIds: [branch.id],
    branchId: branch.id,
    names: new Map([[branch.id, branch.name]]),
    name: branch.name,
    currency: branch.currency,
    timezone: branch.timezone,
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const hourFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date (YYYY-MM-DD) an instant falls on in a timezone. */
export function localDate(instant: Date, timezone: string): string {
  let f = formatters.get(timezone);
  if (!f) formatters.set(timezone, (f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone })));
  return f.format(instant);
}

/** The hour of day (0–23) an instant falls in, in a timezone. */
export function localHour(instant: Date, timezone: string): number {
  let f = hourFormatters.get(timezone);
  if (!f) {
    hourFormatters.set(
      timezone,
      (f = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        hourCycle: "h23",
      })),
    );
  }
  return Number(f.format(instant));
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const todayIn = (timezone: string) => localDate(new Date(), timezone);

/** The instants a range of local dates covers: start of `from` to the end of `to`. */
export function instants(from: string, to: string, timezone: string) {
  return {
    start: localToUtc(from, "00:00", timezone),
    end: localToUtc(addDays(to, 1), "00:00", timezone),
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
