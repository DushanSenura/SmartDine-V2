/** Display helpers. Branch-local times always use the branch's IANA timezone, never the browser's. */

export function formatMoney(amount: number, currency = "LKR"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

/** `YYYY-MM-DD` for "now" in a timezone. */
export function todayInZone(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** `HH:mm` (24h) → locale time label, e.g. "7:00 PM". */
export function formatClock(time: string): string {
  const [hours = "0", minutes = "0"] = time.split(":");
  const d = new Date(Date.UTC(2000, 0, 1, Number(hours), Number(minutes)));
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

export const titleCase = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
