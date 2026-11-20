import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** Read-only stars with a text alternative. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${rating} out of 5 stars`}
      className={cn("inline-flex gap-0.5", className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            "size-4",
            n <= Math.round(rating) ? "fill-warning text-warning" : "text-border",
          )}
        />
      ))}
    </span>
  );
}

/** A 1–5 star picker, operable by keyboard as a radio group. */
export function StarInput({
  value,
  onChange,
  label = "Rating",
}: {
  value: number;
  onChange: (rating: number) => void;
  label?: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded p-0.5 focus-within:ring-2 focus-within:ring-primary"
          >
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            />
            <Star
              aria-hidden
              className={cn(
                "size-7 transition-colors",
                n <= value ? "fill-warning text-warning" : "text-border hover:text-warning",
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
