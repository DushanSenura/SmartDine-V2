import type { ExtraPricingMode, HousekeepingStatus, RoomStatus } from "../constants/rooms";
import type { NightlyRate, StayQuote } from "../schemas/rooms";

const DAY = 86_400_000;

/** Money is held in whole cents internally to avoid floating-point drift. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const toUtcNoon = (date: string) => new Date(`${date}T12:00:00Z`);

export const addDaysIso = (date: string, days: number) =>
  new Date(toUtcNoon(date).getTime() + days * DAY).toISOString().slice(0, 10);

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((toUtcNoon(checkOut).getTime() - toUtcNoon(checkIn).getTime()) / DAY);
}

/** The calendar date of each night of a stay: [checkIn, checkOut). */
export function stayNights(checkIn: string, nights: number): string[] {
  return Array.from({ length: nights }, (_, i) => addDaysIso(checkIn, i));
}

/** Friday and Saturday nights are charged at the weekend rate. */
export const isWeekendNight = (date: string) => [5, 6].includes(toUtcNoon(date).getUTCDay());

export function nightlyRates(
  basePrice: number,
  weekendPrice: number | null,
  nights: string[],
): NightlyRate[] {
  return nights.map((date) => ({
    date,
    price: isWeekendNight(date) && weekendPrice !== null ? weekendPrice : basePrice,
  }));
}

export function extraTotal(
  unitPrice: number,
  mode: ExtraPricingMode,
  quantity: number,
  nights: number,
  guests: number,
): number {
  const multiplier = mode === "PER_NIGHT" ? nights : mode === "PER_GUEST" ? guests : 1;
  return round2(unitPrice * quantity * multiplier);
}

export function buildQuote(input: {
  nightly: NightlyRate[];
  extrasTotal?: number;
  taxRatePercent: number;
  depositPercent: number;
  discount?: number;
  currency: string;
}): StayQuote {
  const roomSubtotal = round2(input.nightly.reduce((sum, n) => sum + n.price, 0));
  const extras = round2(input.extrasTotal ?? 0);
  const discount = round2(input.discount ?? 0);
  const taxable = Math.max(0, roomSubtotal + extras - discount);
  const taxes = round2((taxable * input.taxRatePercent) / 100);
  const total = round2(taxable + taxes);
  return {
    nights: input.nightly.length,
    nightly: input.nightly,
    roomSubtotal,
    extrasTotal: extras,
    taxRatePercent: input.taxRatePercent,
    depositPercent: input.depositPercent,
    taxes,
    discount,
    total,
    deposit: round2((total * input.depositPercent) / 100),
    currency: input.currency,
  };
}

/**
 * Room status after a housekeeping update. Occupied rooms keep their status; a clean room that was
 * being cleaned (or repaired) returns to service; a dirty room is held out of service until cleaned.
 */
export function roomStatusAfterHousekeeping(
  current: RoomStatus,
  next: HousekeepingStatus,
): RoomStatus {
  if (current === "OCCUPIED" || current === "OUT_OF_SERVICE") return current;
  if (next === "MAINTENANCE") return "MAINTENANCE";
  if (next === "CLEAN" || next === "INSPECTION") {
    return current === "CLEANING" || current === "MAINTENANCE" ? "AVAILABLE" : current;
  }
  // DIRTY or CLEANING
  return current === "AVAILABLE" || current === "RESERVED" ? "CLEANING" : current;
}
