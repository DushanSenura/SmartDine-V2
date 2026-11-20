import { OCCASION_LABELS, type ReservationDto } from "@smartdine/shared";
import { CalendarDays, DoorOpen, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { useNow } from "@/hooks/useNow";
import { formatDateTime, formatTime } from "@/utils/format";

import { useCancelReservation, useMyReservations } from "../api/reservationQueries";
import { ReservationStatusBadge } from "../components/StatusBadge";

function ReservationCard({
  reservation,
  onCancel,
}: {
  reservation: ReservationDto;
  onCancel: () => void;
}) {
  const Icon = reservation.type === "PRIVATE_DINING" ? DoorOpen : UtensilsCrossed;
  const active = reservation.status === "PENDING" || reservation.status === "CONFIRMED";
  return (
    <li className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-medium">
              {reservation.type === "PRIVATE_DINING" ? reservation.roomName : "Table reservation"} ·{" "}
              {reservation.branchName}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(reservation.startsAt, reservation.timezone)} –{" "}
              {formatTime(reservation.endsAt, reservation.timezone)}
            </p>
          </div>
        </div>
        <ReservationStatusBadge status={reservation.status} />
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="inline text-muted-foreground">Guests </dt>
          <dd className="inline font-medium">{reservation.partySize}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Reference </dt>
          <dd className="inline font-mono font-medium">{reservation.reference}</dd>
        </div>
        {reservation.areaName && (
          <div>
            <dt className="inline text-muted-foreground">Area </dt>
            <dd className="inline font-medium">{reservation.areaName}</dd>
          </div>
        )}
        {reservation.occasion && (
          <div>
            <dt className="inline text-muted-foreground">Occasion </dt>
            <dd className="inline font-medium">{OCCASION_LABELS[reservation.occasion]}</dd>
          </div>
        )}
      </dl>
      {active && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {reservation.canCancel && reservation.cancellableUntil
              ? `Free cancellation until ${formatDateTime(reservation.cancellableUntil, reservation.timezone)}`
              : "Online cancellation has closed — please call the restaurant to change this booking."}
          </p>
          {reservation.canCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel reservation
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function MyReservationsPage() {
  const { data, isPending, isError, refetch } = useMyReservations();
  const cancel = useCancelReservation();
  const [cancelling, setCancelling] = useState<ReservationDto | null>(null);

  const now = useNow();
  const upcoming = (data ?? [])
    .filter(
      (r) =>
        ["PENDING", "CONFIRMED", "CHECKED_IN", "SEATED"].includes(r.status) &&
        new Date(r.endsAt).getTime() >= now,
    )
    .reverse();
  const past = (data ?? []).filter((r) => !upcoming.includes(r));

  return (
    <div className="space-y-8">
      {isPending && <ListSkeleton />}
      {isError && (
        <ErrorState message="Couldn't load your reservations." onRetry={() => void refetch()} />
      )}
      {data?.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No reservations yet"
          text="Book a table or a private dining room and it will show up here."
          action={
            <Link
              to="/reservations"
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reserve a table
            </Link>
          }
        />
      )}
      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming" className="space-y-3">
          <h2 id="upcoming" className="font-display text-xl font-semibold">
            Upcoming
          </h2>
          <ul className="space-y-3">
            {upcoming.map((r) => (
              <ReservationCard key={r.id} reservation={r} onCancel={() => setCancelling(r)} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-labelledby="past" className="space-y-3">
          <h2 id="past" className="font-display text-xl font-semibold">
            History
          </h2>
          <ul className="space-y-3">
            {past.map((r) => (
              <ReservationCard key={r.id} reservation={r} onCancel={() => setCancelling(r)} />
            ))}
          </ul>
        </section>
      )}
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this reservation?"
        description={
          cancelling
            ? `${cancelling.branchName}, ${formatDateTime(cancelling.startsAt, cancelling.timezone)}. The table or room will be released.`
            : ""
        }
        confirmLabel="Cancel reservation"
        onConfirm={() => cancel.mutateAsync(cancelling!.id)}
      />
    </div>
  );
}
