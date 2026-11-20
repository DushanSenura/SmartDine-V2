import { RESERVATION_RULES, type ReservationDto } from "@smartdine/shared";
import { CalendarX2, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { useAvailability } from "@/features/public/api/publicQueries";
import { BranchPicker } from "@/features/public/components/BranchPicker";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { ApiClientError } from "@/services/api/client";
import { cn } from "@/lib/utils";
import { addDays, formatClock, formatDate, todayInZone } from "@/utils/format";

import { useCreateReservation } from "../api/reservationQueries";
import { useDraftState } from "../hooks/useDraftState";
import { ConfirmationCard } from "./ConfirmationCard";
import { ConfirmBar } from "./ConfirmBar";
import { ContactStep, type ContactValues } from "./ContactStep";
import { Stepper } from "./Stepper";

const STEPS = ["When", "Where", "Your details", "Review"];

interface Draft {
  step: number;
  date: string;
  guests: number;
  time: string | null;
  areaId: string | null;
  contact: Partial<ContactValues>;
}

const initialDraft = (date: string): Draft => ({
  step: 0,
  date,
  guests: 2,
  time: null,
  areaId: null,
  contact: {},
});

export function TableReservationFlow() {
  const { branch, currency } = usePublicBranch();
  const timezone = branch?.timezone ?? "UTC";
  const today = todayInZone(timezone);
  const [draft, update, reset] = useDraftState<Draft>(
    "smartdine-table-draft",
    initialDraft(addDays(today, 1)),
  );
  const [confirmed, setConfirmed] = useState<ReservationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateReservation();

  const availability = useAvailability(branch?.id, draft.date, draft.guests);
  const slot = availability.data?.slots.find((s) => s.time === draft.time);
  const maxDate = addDays(today, RESERVATION_RULES.maxAdvanceDays);

  // A saved draft from an earlier day must not offer past dates.
  const date = draft.date < today ? addDays(today, 1) : draft.date;

  const confirm = async () => {
    if (!branch || !draft.time) return;
    setError(null);
    try {
      const reservation = await create.mutateAsync({
        branchId: branch.id,
        date,
        time: draft.time,
        partySize: draft.guests,
        diningAreaId: draft.areaId ?? undefined,
        guestName: draft.contact.guestName ?? "",
        guestEmail: draft.contact.guestEmail ?? "",
        guestPhone: draft.contact.guestPhone ?? "",
        specialRequest: draft.contact.specialRequest || undefined,
      });
      reset();
      setConfirmed(reservation);
    } catch (e) {
      const message =
        e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.";
      setError(message);
      // Someone else took the table first: go back and show fresh availability.
      if (e instanceof ApiClientError && e.code === "RESERVATION_CONFLICT")
        update({ step: 0, time: null, areaId: null });
    }
  };

  if (confirmed) {
    return (
      <ConfirmationCard
        reservation={confirmed}
        currency={currency}
        onAnother={() => {
          setConfirmed(null);
          reset();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Stepper steps={STEPS} current={draft.step} onSelect={(step) => update({ step })} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={draft.step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
          className="space-y-5"
        >
          {draft.step === 0 && (
            <>
              <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_auto]">
                <div className="space-y-3">
                  <BranchPicker label="Choose location" />
                  <TextField
                    label="Date"
                    type="date"
                    min={today}
                    max={maxDate}
                    value={date}
                    onChange={(e) =>
                      e.target.value && update({ date: e.target.value, time: null, areaId: null })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <span id="guests-label" className="text-sm font-medium">
                    Guests
                  </span>
                  <div
                    role="group"
                    aria-labelledby="guests-label"
                    className="flex h-10 items-center rounded-md border border-border bg-surface"
                  >
                    <button
                      type="button"
                      aria-label="Fewer guests"
                      disabled={draft.guests <= 1}
                      onClick={() => update({ guests: draft.guests - 1, time: null, areaId: null })}
                      className="grid size-10 place-items-center disabled:opacity-40"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <output aria-live="polite" className="w-8 text-center font-medium">
                      {draft.guests}
                    </output>
                    <button
                      type="button"
                      aria-label="More guests"
                      disabled={draft.guests >= 20}
                      onClick={() => update({ guests: draft.guests + 1, time: null, areaId: null })}
                      className="grid size-10 place-items-center disabled:opacity-40"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous day"
                    disabled={date <= today}
                    onClick={() => update({ date: addDays(date, -1), time: null })}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next day"
                    disabled={date >= maxDate}
                    onClick={() => update({ date: addDays(date, 1), time: null })}
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{formatDate(date)}</p>

              {availability.isPending && (
                <div
                  role="status"
                  aria-label="Checking availability"
                  className="grid grid-cols-3 gap-2 sm:grid-cols-5"
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <div
                      key={i}
                      className="h-10 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none"
                    />
                  ))}
                </div>
              )}
              {availability.isError && (
                <p role="alert" className="text-sm text-danger">
                  Couldn't check availability. Please try again.
                </p>
              )}
              {availability.data?.closed && (
                <EmptyState
                  icon={CalendarX2}
                  title="We're closed that day"
                  text="Please choose another date."
                />
              )}
              {availability.data && !availability.data.closed && (
                <>
                  {availability.data.slots.every((s) => !s.available) ? (
                    <EmptyState
                      icon={CalendarX2}
                      title="No tables available"
                      text={`We're fully booked for ${draft.guests} ${draft.guests === 1 ? "guest" : "guests"} on this date. Try another day or a smaller party.`}
                    />
                  ) : (
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium">Choose a time</legend>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {availability.data.slots.map((s) => (
                          <button
                            key={s.time}
                            type="button"
                            disabled={!s.available}
                            aria-pressed={draft.time === s.time}
                            onClick={() => update({ time: s.time, areaId: null })}
                            className={cn(
                              "h-10 rounded-md border text-sm font-medium transition-colors",
                              draft.time === s.time
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-surface hover:bg-surface-muted",
                              !s.available &&
                                "cursor-not-allowed text-muted-foreground line-through opacity-50 hover:bg-surface",
                            )}
                          >
                            {formatClock(s.time)}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Tables are held for {availability.data.durationMinutes} minutes.
                      </p>
                    </fieldset>
                  )}
                </>
              )}
              <div className="flex justify-end">
                <Button
                  disabled={!draft.time || !slot?.available}
                  onClick={() => update({ step: 1, date })}
                >
                  Continue
                </Button>
              </div>
            </>
          )}

          {draft.step === 1 && (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Where would you like to sit?</legend>
                {[
                  {
                    id: null as string | null,
                    name: "No preference",
                    note: "We'll give you the best available table",
                  },
                  ...(slot?.areas ?? []).map((a) => ({
                    id: a.id as string | null,
                    name: a.name,
                    note: `${a.tables} ${a.tables === 1 ? "table" : "tables"} available`,
                  })),
                ].map((option) => (
                  <label
                    key={option.id ?? "any"}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 transition-colors",
                      draft.areaId === option.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-surface-muted",
                    )}
                  >
                    <span>
                      <span className="block font-medium">{option.name}</span>
                      <span className="text-sm text-muted-foreground">{option.note}</span>
                    </span>
                    <input
                      type="radio"
                      name="area"
                      checked={draft.areaId === option.id}
                      onChange={() => update({ areaId: option.id })}
                      className="size-4 accent-[var(--primary)]"
                    />
                  </label>
                ))}
              </fieldset>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => update({ step: 0 })}>
                  Back
                </Button>
                <Button onClick={() => update({ step: 2 })}>Continue</Button>
              </div>
            </>
          )}

          {draft.step === 2 && (
            <ContactStep
              initial={draft.contact}
              onBack={() => update({ step: 1 })}
              onSubmit={(contact) => update({ contact, step: 3 })}
            />
          )}

          {draft.step === 3 && branch && draft.time && (
            <>
              <dl className="grid gap-3 rounded-lg border border-border bg-surface p-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Where</dt>
                  <dd className="font-medium">
                    {branch.name}
                    {draft.areaId && slot?.areas.find((a) => a.id === draft.areaId)
                      ? ` — ${slot.areas.find((a) => a.id === draft.areaId)!.name}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">When</dt>
                  <dd className="font-medium">
                    {formatDate(date)}, {formatClock(draft.time)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Guests</dt>
                  <dd className="font-medium">{draft.guests}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium">{draft.contact.guestName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="font-medium">
                    {draft.contact.guestEmail} · {draft.contact.guestPhone}
                  </dd>
                </div>
                {draft.contact.specialRequest && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Special requests</dt>
                    <dd className="font-medium">{draft.contact.specialRequest}</dd>
                  </div>
                )}
              </dl>
              <ConfirmBar
                busy={create.isPending}
                error={error}
                confirmLabel="Confirm reservation"
                onBack={() => update({ step: 2 })}
                onConfirm={() => void confirm()}
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {error && draft.step === 0 && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
