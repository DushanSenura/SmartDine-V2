import type { RoomTypeDto, StayQuote } from "@smartdine/shared";
import { BedDouble, Check, Maximize2, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDate, formatMoney, titleCase } from "@/utils/format";

export function RoomVisual({ type, className }: { type: RoomTypeDto; className?: string }) {
  const image = type.images[0];
  if (image)
    return (
      <img src={image} alt={type.name} loading="lazy" className={cn("object-cover", className)} />
    );
  // No photo yet: a calm placeholder.
  return (
    <div
      aria-hidden
      className={cn(
        "grid place-items-center bg-gradient-to-br from-primary/15 via-surface-muted to-accent/30",
        className,
      )}
    >
      <BedDouble className="size-10 text-primary/50" />
    </div>
  );
}

export function RoomFacts({ type }: { type: RoomTypeDto }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <Users className="size-4" aria-hidden /> Sleeps {type.maximumGuests}
      </li>
      <li className="flex items-center gap-1.5">
        <BedDouble className="size-4" aria-hidden /> {type.numberOfBeds} × {titleCase(type.bedType)}{" "}
        bed
      </li>
      {type.roomSize && (
        <li className="flex items-center gap-1.5">
          <Maximize2 className="size-4" aria-hidden /> {type.roomSize} m²
        </li>
      )}
    </ul>
  );
}

export function Amenities({ items, limit }: { items: string[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul
      aria-label="Amenities"
      className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3"
    >
      {shown.map((a) => (
        <li key={a} className="flex items-center gap-1.5">
          <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> {a}
        </li>
      ))}
      {limit && items.length > limit && (
        <li className="text-muted-foreground">+{items.length - limit} more</li>
      )}
    </ul>
  );
}

/** Nightly rates, extras, taxes and what is due now. */
export function PriceBreakdown({
  quote,
  extras = [],
}: {
  quote: StayQuote;
  extras?: { name: string; total: number }[];
}) {
  const money = (n: number) => formatMoney(n, quote.currency);
  return (
    <dl className="space-y-1.5 text-sm">
      {quote.nightly.map((n) => (
        <div key={n.date} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            {formatDate(n.date).split(",").slice(0, 2).join(",")}
          </dt>
          <dd>{money(n.price)}</dd>
        </div>
      ))}
      {extras.map((e) => (
        <div key={e.name} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{e.name}</dt>
          <dd>{money(e.total)}</dd>
        </div>
      ))}
      {quote.taxes > 0 && (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Taxes ({quote.taxRatePercent}%)</dt>
          <dd>{money(quote.taxes)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3 border-t border-border pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd>{money(quote.total)}</dd>
      </div>
      {quote.deposit > 0 && (
        <div className="flex justify-between gap-3 text-muted-foreground">
          <dt>Deposit to secure ({quote.depositPercent}%)</dt>
          <dd>{money(quote.deposit)}</dd>
        </div>
      )}
    </dl>
  );
}
