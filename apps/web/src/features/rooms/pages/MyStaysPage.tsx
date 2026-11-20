import {
  ROOM_BOOKING_STATUS_LABELS,
  type RoomBookingDto,
  type RoomBookingStatus,
} from "@smartdine/shared";
import { BedDouble } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useNow } from "@/hooks/useNow";
import { formatDate, formatDateTime, formatMoney } from "@/utils/format";

import { useCancelRoomBooking, useMyRoomBookings } from "../api/roomQueries";

const TONES: Record<RoomBookingStatus, "warning" | "success" | "info" | "neutral" | "danger"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CHECKED_IN: "info",
  CHECKED_OUT: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
};

function StayCard({ booking, onCancel }: { booking: RoomBookingDto; onCancel: () => void }) {
  const holds = booking.status === "PENDING" || booking.status === "CONFIRMED";
  return (
    <li className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
            <BedDouble className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-medium">
              {booking.roomTypeName} · {booking.branchName}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)} ({booking.nights}{" "}
              {booking.nights === 1 ? "night" : "nights"})
            </p>
          </div>
        </div>
        <Badge tone={TONES[booking.status]}>{ROOM_BOOKING_STATUS_LABELS[booking.status]}</Badge>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="inline text-muted-foreground">Reference </dt>
          <dd className="inline font-mono font-medium">{booking.reference}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Guests </dt>
          <dd className="inline font-medium">{booking.adults + booking.children}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Total </dt>
          <dd className="inline font-medium">{formatMoney(booking.total, booking.currency)}</dd>
        </div>
        {booking.roomNumber && booking.status === "CHECKED_IN" && (
          <div>
            <dt className="inline text-muted-foreground">Room </dt>
            <dd className="inline font-medium">{booking.roomNumber}</dd>
          </div>
        )}
      </dl>
      {holds && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {booking.canCancel && booking.cancellableUntil
              ? `Free cancellation until ${formatDateTime(booking.cancellableUntil, booking.timezone)}.`
              : "Online cancellation has closed — please contact the hotel to change this booking."}
          </p>
          {booking.canCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel booking
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function MyStaysPage() {
  const { data, isPending, isError, refetch } = useMyRoomBookings();
  const cancel = useCancelRoomBooking();
  const [cancelling, setCancelling] = useState<RoomBookingDto | null>(null);
  const now = useNow();

  const upcoming = (data ?? [])
    .filter(
      (b) =>
        ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(b.status) &&
        new Date(`${b.checkOut}T23:59:59Z`).getTime() >= now,
    )
    .reverse();
  const past = (data ?? []).filter((b) => !upcoming.includes(b));

  return (
    <div className="space-y-8">
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load your stays." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={BedDouble}
          title="No stays yet"
          text="Book a room and it will show up here."
          action={
            <Link
              to="/rooms"
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Find a room
            </Link>
          }
        />
      )}
      {upcoming.length > 0 && (
        <section aria-labelledby="stays-upcoming" className="space-y-3">
          <h2 id="stays-upcoming" className="font-display text-xl font-semibold">
            Upcoming
          </h2>
          <ul className="space-y-3">
            {upcoming.map((b) => (
              <StayCard key={b.id} booking={b} onCancel={() => setCancelling(b)} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-labelledby="stays-past" className="space-y-3">
          <h2 id="stays-past" className="font-display text-xl font-semibold">
            History
          </h2>
          <ul className="space-y-3">
            {past.map((b) => (
              <StayCard key={b.id} booking={b} onCancel={() => setCancelling(b)} />
            ))}
          </ul>
        </section>
      )}
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this booking?"
        description={
          cancelling
            ? `${cancelling.roomTypeName}, ${formatDate(cancelling.checkIn)} → ${formatDate(cancelling.checkOut)}. The room will be released.`
            : ""
        }
        confirmLabel="Cancel booking"
        onConfirm={() => cancel.mutateAsync(cancelling!.id)}
      />
    </div>
  );
}
