import type { PublicOfferDto } from "@smartdine/shared";

import { formatDate, formatMoney } from "@/utils/format";

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** When an offer applies: days, hours and end date, joined for display. */
export function offerWhen(o: PublicOfferDto) {
  return [
    o.daysOfWeek.length > 0 && o.daysOfWeek.length < 7
      ? o.daysOfWeek.map((d) => DAY_NAMES[d]).join(", ")
      : null,
    o.startTime && o.endTime ? `${o.startTime}–${o.endTime}` : null,
    o.endsOn ? `until ${formatDate(o.endsOn)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The headline benefit ("20% off"), or null for offers without a simple figure. */
export function offerHeadline(o: PublicOfferDto, currency: string) {
  if (o.type === "PERCENTAGE" || o.type === "HAPPY_HOUR") return `${o.value}% off`;
  if (o.type === "FIXED") return `${formatMoney(o.value, currency)} off`;
  if (o.type === "LOYALTY_MULTIPLIER") return `${o.value}× loyalty points`;
  return null;
}
