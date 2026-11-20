import { ROOM_RULES } from "@smartdine/shared";
import { Minus, Plus, Search } from "lucide-react";
import { useState } from "react";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { BranchPicker } from "@/features/public/components/BranchPicker";
import { addDays } from "@/utils/format";

import type { StaySearch } from "../api/roomQueries";

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = `counter-${label}`;
  return (
    <div className="space-y-1.5">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={id}
        className="flex h-10 items-center rounded-md border border-border bg-surface"
      >
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="grid size-10 place-items-center disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <output aria-live="polite" className="w-8 text-center font-medium">
          {value}
        </output>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="grid size-10 place-items-center disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Dates and party size. Submitting commits the search (which re-runs availability). */
export function StaySearchForm({
  value,
  today,
  onSubmit,
}: {
  value: StaySearch;
  today: string;
  onSubmit: (next: StaySearch) => void;
}) {
  const [draft, setDraft] = useState(value);
  const nights = Math.max(
    0,
    Math.round((Date.parse(draft.checkOut) - Date.parse(draft.checkIn)) / 86_400_000),
  );
  const invalid = nights < 1 || nights > ROOM_RULES.maxNights;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onSubmit(draft);
      }}
      className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
      aria-label="Search rooms"
    >
      <BranchPicker label="Choose location" />
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
        <TextField
          label="Check-in"
          type="date"
          min={today}
          value={draft.checkIn}
          onChange={(e) => {
            const checkIn = e.target.value;
            if (!checkIn) return;
            // Keep the stay length when the arrival moves past the departure.
            setDraft({
              ...draft,
              checkIn,
              checkOut: draft.checkOut > checkIn ? draft.checkOut : addDays(checkIn, 1),
            });
          }}
        />
        <TextField
          label="Check-out"
          type="date"
          min={addDays(draft.checkIn, 1)}
          value={draft.checkOut}
          error={
            nights > ROOM_RULES.maxNights
              ? `Stays are limited to ${ROOM_RULES.maxNights} nights`
              : undefined
          }
          onChange={(e) => e.target.value && setDraft({ ...draft, checkOut: e.target.value })}
        />
        <Counter
          label="Adults"
          value={draft.adults}
          min={1}
          max={ROOM_RULES.maxGuestsPerBooking}
          onChange={(adults) => setDraft({ ...draft, adults })}
        />
        <Counter
          label="Children"
          value={draft.children}
          min={0}
          max={ROOM_RULES.maxGuestsPerBooking}
          onChange={(children) => setDraft({ ...draft, children })}
        />
        <Button type="submit" size="lg" disabled={invalid}>
          <Search className="size-4" aria-hidden /> Search
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {nights > 0
          ? `${nights} ${nights === 1 ? "night" : "nights"}`
          : "Check-out must be after check-in"}
      </p>
    </form>
  );
}
