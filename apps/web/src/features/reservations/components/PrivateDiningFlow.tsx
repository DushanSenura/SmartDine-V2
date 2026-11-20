import {
  OCCASIONS,
  OCCASION_LABELS,
  RESERVATION_RULES,
  type Occasion,
  type ReservationDto,
} from "@smartdine/shared";
import { Check, DoorOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import {
  usePrivateAvailability,
  usePublicPrivateRooms,
  type PublicPrivateRoom,
} from "@/features/public/api/publicQueries";
import { BranchPicker } from "@/features/public/components/BranchPicker";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { ApiClientError } from "@/services/api/client";
import { cn } from "@/lib/utils";
import { addDays, formatClock, formatDate, formatMoney, todayInZone } from "@/utils/format";

import { useCreatePrivateReservation } from "../api/reservationQueries";
import { useDraftState } from "../hooks/useDraftState";
import { ConfirmationCard } from "./ConfirmationCard";
import { ConfirmBar } from "./ConfirmBar";
import { ContactStep, type ContactValues } from "./ContactStep";
import { Stepper } from "./Stepper";

const STEPS = ["Room", "Date & time", "Your details", "Review"];

interface Draft {
  step: number;
  roomId: string | null;
  date: string;
  time: string | null;
  durationMinutes: number;
  guests: number;
  occasion: Occasion;
  contact: Partial<ContactValues>;
}

const toMinutes = (hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
};
const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const DURATIONS = Array.from({ length: 23 }, (_, i) => 60 + i * 30); // 1h … 12h
const durationLabel = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? " 30m" : ""}`;

function RoomCard({
  room,
  selected,
  currency,
  onSelect,
}: {
  room: PublicPrivateRoom;
  selected: boolean;
  currency: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex h-full w-full flex-col gap-3 rounded-xl border p-5 text-left transition-colors",
          selected
            ? "border-primary bg-primary/5"
            : "border-border bg-surface hover:bg-surface-muted",
        )}
      >
        {room.images[0] ? (
          <img
            src={room.images[0]}
            alt={room.name}
            loading="lazy"
            className="aspect-[16/9] w-full rounded-lg object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="grid aspect-[16/9] place-items-center rounded-lg bg-gradient-to-br from-primary/15 to-accent/30"
          >
            <DoorOpen className="size-8 text-primary/50" />
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">{room.name}</h3>
          {selected && <Check className="size-5 text-primary" aria-label="Selected" />}
        </div>
        {room.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{room.description}</p>
        )}
        <p className="text-sm">
          {room.minimumGuests}–{room.maximumGuests} guests
        </p>
        <p className="text-xs text-muted-foreground">
          {room.hourlyRate ? `${formatMoney(room.hourlyRate, currency)}/hour` : ""}
          {room.minimumSpend ? ` · min. spend ${formatMoney(room.minimumSpend, currency)}` : ""}
          {room.deposit ? ` · ${formatMoney(room.deposit, currency)} deposit` : ""}
        </p>
        {room.amenities.length > 0 && (
          <p className="text-xs text-muted-foreground">{room.amenities.join(" · ")}</p>
        )}
      </button>
    </li>
  );
}

export function PrivateDiningFlow() {
  const { branch, currency } = usePublicBranch();
  const timezone = branch?.timezone ?? "UTC";
  const today = todayInZone(timezone);
  const [draft, update, reset] = useDraftState<Draft>("smartdine-private-draft", {
    step: 0,
    roomId: null,
    date: addDays(today, 7),
    time: null,
    durationMinutes: 180,
    guests: 10,
    occasion: "CELEBRATION",
    contact: {},
  });
  const [confirmed, setConfirmed] = useState<ReservationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useCreatePrivateReservation();

  const rooms = usePublicPrivateRooms(branch?.id);
  const room = rooms.data?.find((r) => r.id === draft.roomId);
  const date = draft.date < today ? addDays(today, 7) : draft.date;
  const availability = usePrivateAvailability(room?.id, date);

  // Start times that fit the opening window and do not collide with existing bookings.
  const startOptions = useMemo(() => {
    const a = availability.data;
    if (!a || a.closed || !a.opens || !a.closes) return [];
    const opens = toMinutes(a.opens);
    let closes = toMinutes(a.closes);
    if (closes <= opens) closes += 24 * 60;
    const busy = a.busy.map((b) => {
      const s = toMinutes(b.start);
      let e = toMinutes(b.end);
      if (e <= s) e += 24 * 60;
      return { s: s < opens ? s + 24 * 60 : s, e: e <= opens ? e + 24 * 60 : e };
    });
    const options: string[] = [];
    for (
      let start = opens;
      start + draft.durationMinutes <= closes;
      start += RESERVATION_RULES.slotIntervalMinutes
    ) {
      const end = start + draft.durationMinutes;
      if (!busy.some((b) => start < b.e && b.s < end)) options.push(toClock(start));
    }
    return options;
  }, [availability.data, draft.durationMinutes]);

  const guestsOk =
    !!room && draft.guests >= room.minimumGuests && draft.guests <= room.maximumGuests;
  const timeOk = !!draft.time && startOptions.includes(draft.time);

  const confirm = async () => {
    if (!room || !draft.time) return;
    setError(null);
    try {
      const reservation = await create.mutateAsync({
        roomId: room.id,
        date,
        time: draft.time,
        durationMinutes: draft.durationMinutes,
        partySize: draft.guests,
        occasion: draft.occasion,
        guestName: draft.contact.guestName ?? "",
        guestEmail: draft.contact.guestEmail ?? "",
        guestPhone: draft.contact.guestPhone ?? "",
        specialRequest: draft.contact.specialRequest || undefined,
      });
      reset();
      setConfirmed(reservation);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
      if (e instanceof ApiClientError && e.code === "RESERVATION_CONFLICT")
        update({ step: 1, time: null });
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

  const estimated = room?.hourlyRate ? (room.hourlyRate * draft.durationMinutes) / 60 : null;

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
              <BranchPicker label="Choose location" />
              {rooms.isPending && (
                <div
                  role="status"
                  aria-label="Loading rooms"
                  className="h-40 animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none"
                />
              )}
              {rooms.data?.length === 0 && (
                <EmptyState
                  icon={DoorOpen}
                  title="No private rooms at this location"
                  text="Please call us to discuss your event, or choose another location."
                />
              )}
              <ul className="grid gap-4 md:grid-cols-2">
                {rooms.data?.map((r) => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    selected={r.id === draft.roomId}
                    currency={currency}
                    onSelect={() =>
                      update({
                        roomId: r.id,
                        time: null,
                        guests: Math.min(Math.max(draft.guests, r.minimumGuests), r.maximumGuests),
                      })
                    }
                  />
                ))}
              </ul>
              <div className="flex justify-end">
                <Button disabled={!room} onClick={() => update({ step: 1 })}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {draft.step === 1 && room && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Date"
                  type="date"
                  min={today}
                  max={addDays(today, RESERVATION_RULES.maxAdvanceDays)}
                  value={date}
                  onChange={(e) => e.target.value && update({ date: e.target.value, time: null })}
                />
                <SelectField
                  label="Occasion"
                  value={draft.occasion}
                  onChange={(e) => update({ occasion: e.target.value as Occasion })}
                  options={OCCASIONS.map((o) => ({ value: o, label: OCCASION_LABELS[o] }))}
                />
                <SelectField
                  label="Duration"
                  value={String(draft.durationMinutes)}
                  onChange={(e) => update({ durationMinutes: Number(e.target.value), time: null })}
                  options={DURATIONS.map((m) => ({ value: String(m), label: durationLabel(m) }))}
                />
                <TextField
                  label={`Guests (${room.minimumGuests}–${room.maximumGuests})`}
                  type="number"
                  min={room.minimumGuests}
                  max={room.maximumGuests}
                  value={draft.guests}
                  error={
                    guestsOk
                      ? undefined
                      : `${room.name} hosts ${room.minimumGuests}–${room.maximumGuests} guests`
                  }
                  onChange={(e) => update({ guests: Number(e.target.value) })}
                />
              </div>
              <p className="text-sm text-muted-foreground">{formatDate(date)}</p>

              {availability.isPending && (
                <div
                  role="status"
                  aria-label="Checking availability"
                  className="h-20 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none"
                />
              )}
              {availability.data?.closed && (
                <EmptyState
                  icon={DoorOpen}
                  title="Not available that day"
                  text="Please choose another date."
                />
              )}
              {availability.data &&
                !availability.data.closed &&
                (startOptions.length === 0 ? (
                  <EmptyState
                    icon={DoorOpen}
                    title="No start times left"
                    text="The room is booked or the duration is too long for that day. Try a shorter duration or another date."
                  />
                ) : (
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">
                      Start time{" "}
                      <span className="font-normal text-muted-foreground">
                        (room open {formatClock(availability.data.opens!)}–
                        {formatClock(availability.data.closes!)})
                      </span>
                    </legend>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {startOptions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={draft.time === t}
                          onClick={() => update({ time: t })}
                          className={cn(
                            "h-10 rounded-md border text-sm font-medium transition-colors",
                            draft.time === t
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-surface hover:bg-surface-muted",
                          )}
                        >
                          {formatClock(t)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => update({ step: 0 })}>
                  Back
                </Button>
                <Button disabled={!timeOk || !guestsOk} onClick={() => update({ step: 2, date })}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {draft.step === 2 && (
            <ContactStep
              initial={draft.contact}
              specialRequestLabel="Event details & special requests (optional)"
              onBack={() => update({ step: 1 })}
              onSubmit={(contact) => update({ contact, step: 3 })}
            />
          )}

          {draft.step === 3 && room && draft.time && (
            <>
              <dl className="grid gap-3 rounded-lg border border-border bg-surface p-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Room</dt>
                  <dd className="font-medium">
                    {room.name}, {branch?.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">When</dt>
                  <dd className="font-medium">
                    {formatDate(date)}, {formatClock(draft.time)} (
                    {durationLabel(draft.durationMinutes)})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Guests · occasion</dt>
                  <dd className="font-medium">
                    {draft.guests} · {OCCASION_LABELS[draft.occasion]}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="font-medium">
                    {draft.contact.guestName} · {draft.contact.guestPhone}
                  </dd>
                </div>
                {estimated !== null && (
                  <div>
                    <dt className="text-muted-foreground">Room estimate</dt>
                    <dd className="font-medium">{formatMoney(estimated, currency)}</dd>
                  </div>
                )}
                {room.deposit ? (
                  <div>
                    <dt className="text-muted-foreground">Deposit (after approval)</dt>
                    <dd className="font-medium">{formatMoney(room.deposit, currency)}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="rounded-lg bg-surface-muted p-3 text-sm">
                Private dining requests are confirmed by our team.{" "}
                {room.minimumSpend
                  ? `A minimum spend of ${formatMoney(room.minimumSpend, currency)} applies. `
                  : ""}
                {room.specialRules}
              </p>
              <ConfirmBar
                busy={create.isPending}
                error={error}
                confirmLabel="Send request"
                onBack={() => update({ step: 2 })}
                onConfirm={() => void confirm()}
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
