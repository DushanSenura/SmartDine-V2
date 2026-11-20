import { buildQuote, extraTotal, type RoomBookingDto } from "@smartdine/shared";
import { ChevronLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { ConfirmBar } from "@/features/reservations/components/ConfirmBar";
import { ContactStep, type ContactValues } from "@/features/reservations/components/ContactStep";
import { Stepper } from "@/features/reservations/components/Stepper";
import { useDraftState } from "@/features/reservations/hooks/useDraftState";
import { ApiClientError } from "@/services/api/client";
import { formatDate, formatMoney } from "@/utils/format";

import { useCreateRoomBooking, usePublicRoomExtras, useRoomAvailability } from "../api/roomQueries";
import { PriceBreakdown, RoomFacts, RoomVisual } from "../components/RoomParts";
import { StayConfirmation } from "../components/StayConfirmation";
import { useStaySearch } from "../hooks/useStaySearch";
import { BedDouble } from "lucide-react";

const STEPS = ["Extras", "Guest details", "Review"];

interface Draft {
  step: number;
  extras: Record<string, number>;
  contact: Partial<ContactValues>;
  otherGuests: string[];
}

export function RoomBookingPage() {
  const { slug } = useParams();
  const { branch } = usePublicBranch();
  const { search, queryString } = useStaySearch();
  const availability = useRoomAvailability(branch?.id, search);
  const extrasQuery = usePublicRoomExtras(branch?.id);
  const create = useCreateRoomBooking();

  const [draft, update, reset] = useDraftState<Draft>(`smartdine-room-draft-${slug}`, {
    step: 0,
    extras: {},
    contact: {},
    otherGuests: [],
  });
  const [confirmed, setConfirmed] = useState<RoomBookingDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offer = availability.data?.results.find((r) => r.roomType.slug === slug);
  const guests = search.adults + search.children;

  // Same arithmetic as the server (shared package), so the review matches the final charge.
  const priced = useMemo(() => {
    if (!offer) return null;
    const lines = (extrasQuery.data ?? [])
      .filter((e) => (draft.extras[e.id] ?? 0) > 0)
      .map((e) => ({
        name: e.name,
        quantity: draft.extras[e.id]!,
        total: extraTotal(e.price, e.pricingMode, draft.extras[e.id]!, offer.quote.nights, guests),
      }));
    const quote = buildQuote({
      nightly: offer.quote.nightly,
      extrasTotal: lines.reduce((sum, l) => sum + l.total, 0),
      taxRatePercent: offer.quote.taxRatePercent,
      depositPercent: offer.quote.depositPercent,
      currency: offer.quote.currency,
    });
    return { lines, quote };
  }, [offer, extrasQuery.data, draft.extras, guests]);

  if (confirmed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <StayConfirmation
          booking={confirmed}
          onAnother={() => {
            setConfirmed(null);
            reset();
          }}
        />
      </div>
    );
  }

  if (availability.isPending || extrasQuery.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="mx-auto mt-10 h-96 max-w-4xl animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none"
      />
    );
  }
  if (!offer || !priced || !branch) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={BedDouble}
          title="This room isn't available for your dates"
          text="It may have just been booked. Search again to see what's free."
          action={
            <Link
              to={`/rooms?${queryString}`}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Search rooms
            </Link>
          }
        />
      </div>
    );
  }

  const room = offer.roomType;
  const extras = extrasQuery.data ?? [];
  const otherCount = Math.max(0, guests - 1);

  const confirm = async () => {
    setError(null);
    try {
      const booking = await create.mutateAsync({
        branchId: branch.id,
        roomTypeId: room.id,
        checkIn: search.checkIn,
        checkOut: search.checkOut,
        adults: search.adults,
        children: search.children,
        extras: Object.entries(draft.extras)
          .filter(([, q]) => q > 0)
          .map(([extraId, quantity]) => ({ extraId, quantity })),
        additionalGuests: draft.otherGuests
          .map((name, i) => ({ name: name.trim(), isChild: i >= search.adults - 1 }))
          .filter((g) => g.name),
        specialRequests: draft.contact.specialRequest || undefined,
        guestName: draft.contact.guestName ?? "",
        guestEmail: draft.contact.guestEmail ?? "",
        guestPhone: draft.contact.guestPhone ?? "",
      });
      reset();
      setConfirmed(booking);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        to={`/rooms/${room.slug}?${queryString}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> Back to room
      </Link>
      <h1 className="font-display text-3xl font-semibold">Book {room.name}</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
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
                  {extras.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      There are no optional extras for this stay.
                    </p>
                  ) : (
                    <fieldset className="space-y-3">
                      <legend className="text-sm font-medium">Add extras (optional)</legend>
                      {extras.map((e) => {
                        const qty = draft.extras[e.id] ?? 0;
                        return (
                          <label
                            key={e.id}
                            className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                          >
                            <span>
                              <span className="block font-medium">{e.name}</span>
                              <span className="text-sm text-muted-foreground">
                                {e.description ? `${e.description} · ` : ""}
                                {formatMoney(e.price, offer.quote.currency)}{" "}
                                {e.pricingMode === "PER_NIGHT"
                                  ? "per night"
                                  : e.pricingMode === "PER_GUEST"
                                    ? "per guest"
                                    : "per stay"}
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              className="size-5 accent-[var(--primary)]"
                              checked={qty > 0}
                              onChange={(ev) =>
                                update((d) => ({
                                  extras: { ...d.extras, [e.id]: ev.target.checked ? 1 : 0 },
                                }))
                              }
                            />
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={() => update({ step: 1 })}>Continue</Button>
                  </div>
                </>
              )}

              {draft.step === 1 && (
                <div className="space-y-6">
                  <ContactStep
                    initial={draft.contact}
                    specialRequestLabel="Special requests (optional)"
                    onBack={() => update({ step: 0 })}
                    onSubmit={(contact) => update({ contact, step: 2 })}
                  />
                  {otherCount > 0 && (
                    <fieldset className="space-y-3 border-t border-border pt-4">
                      <legend className="text-sm font-medium">Other guests (optional)</legend>
                      <p className="text-xs text-muted-foreground">
                        Names are saved with the booking; you can also add them at check-in.
                      </p>
                      {Array.from({ length: otherCount }, (_, i) => (
                        <TextField
                          key={i}
                          label={`${i >= search.adults - 1 ? "Child" : "Adult"} ${i + 1}`}
                          value={draft.otherGuests[i] ?? ""}
                          onChange={(e) =>
                            update((d) => {
                              const next = [...d.otherGuests];
                              next[i] = e.target.value;
                              return { otherGuests: next };
                            })
                          }
                        />
                      ))}
                    </fieldset>
                  )}
                </div>
              )}

              {draft.step === 2 && (
                <>
                  <dl className="grid gap-3 rounded-lg border border-border bg-surface p-5 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Room</dt>
                      <dd className="font-medium">
                        {room.name}, {branch.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Guests</dt>
                      <dd className="font-medium">
                        {search.adults} adults
                        {search.children ? `, ${search.children} children` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Check-in</dt>
                      <dd className="font-medium">
                        {formatDate(search.checkIn)} from {availability.data!.checkInTime}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Check-out</dt>
                      <dd className="font-medium">
                        {formatDate(search.checkOut)} by {availability.data!.checkOutTime}
                      </dd>
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
                  <p className="rounded-lg bg-surface-muted p-3 text-sm">
                    Booking holds your room immediately. A deposit of{" "}
                    {formatMoney(priced.quote.deposit, priced.quote.currency)} is collected by the
                    hotel; free cancellation is available until shortly before check-in.
                  </p>
                  <ConfirmBar
                    busy={create.isPending}
                    error={error}
                    confirmLabel="Confirm booking"
                    onBack={() => update({ step: 1 })}
                    onConfirm={() => void confirm()}
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside
          aria-label="Price summary"
          className="h-fit space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-24"
        >
          <RoomVisual type={room} className="aspect-[16/9] w-full rounded-lg" />
          <div>
            <h2 className="font-display text-lg font-semibold">{room.name}</h2>
            <RoomFacts type={room} />
          </div>
          <PriceBreakdown quote={priced.quote} extras={priced.lines} />
        </aside>
      </div>
    </div>
  );
}
