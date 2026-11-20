import {
  ROOM_BOOKING_STATUS_LABELS,
  ROOM_BOOKING_TRANSITIONS,
  type RoomBookingDto,
  type RoomBookingStatus,
} from "@smartdine/shared";
import { motion } from "motion/react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate, formatMoney } from "@/utils/format";

import { useFolio } from "@/features/cashier/api/cashierQueries";

import { useAssignRoom, useFreeRooms, useSetRoomBookingStatus } from "../api/roomQueries";

const TONES: Record<RoomBookingStatus, "warning" | "success" | "info" | "neutral" | "danger"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CHECKED_IN: "info",
  CHECKED_OUT: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
};

const ACTION_LABELS: Partial<Record<RoomBookingStatus, string>> = {
  CONFIRMED: "Confirm",
  CHECKED_IN: "Check in",
  CHECKED_OUT: "Check out",
  NO_SHOW: "No-show",
  CANCELLED: "Cancel",
};

/** Re-keyed on status so a change animates in rather than swapping instantly. */
export function BookingStatusBadge({ status }: { status: RoomBookingStatus }) {
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, y: -4, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22 }}
      className="inline-block"
    >
      <Badge tone={TONES[status]}>{ROOM_BOOKING_STATUS_LABELS[status]}</Badge>
    </motion.span>
  );
}

function ChangeRoomDialog({ booking, onClose }: { booking: RoomBookingDto; onClose: () => void }) {
  const free = useFreeRooms(booking.id);
  const assign = useAssignRoom();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Change room"
      description={`Rooms of type ${booking.roomTypeName} free for these dates.`}
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      {free.isPending && (
        <div
          role="status"
          aria-label="Loading"
          className="h-16 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none"
        />
      )}
      {free.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No other rooms of this type are free for these dates.
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {free.data?.map((room) => (
          <li key={room.id}>
            <button
              type="button"
              disabled={assign.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await assign.mutateAsync({ id: booking.id, roomId: room.id });
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't change the room.");
                }
              }}
              className="w-full rounded-lg border border-border p-3 text-left hover:bg-surface-muted"
            >
              <span className="block font-medium">Room {room.roomNumber}</span>
              <span className="text-xs text-muted-foreground">
                Floor {room.floor} · {room.housekeepingStatus.toLowerCase()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Restaurant charges posted to the guest's room, to be settled with the final bill. */
function FolioDialog({ booking, onClose }: { booking: RoomBookingDto; onClose: () => void }) {
  const { data, isPending, isError } = useFolio(booking.id);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Room charges"
      description={`Restaurant and room-service charges for ${booking.guestName}.`}
    >
      {isPending && (
        <div
          role="status"
          aria-label="Loading"
          className="h-16 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none"
        />
      )}
      {isError && (
        <p role="alert" className="text-sm text-danger">
          Couldn't load the room charges.
        </p>
      )}
      {data?.charges.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing has been charged to this room.</p>
      )}
      {data && data.charges.length > 0 && (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.charges.map((c) => (
              <li key={c.paymentId} className="flex justify-between gap-3 p-3 text-sm">
                <span>
                  Order {c.orderNumber}
                  <span className="block text-xs text-muted-foreground">
                    {c.billNumber} · {formatDate(c.createdAt.slice(0, 10))}
                  </span>
                </span>
                <span>{formatMoney(c.amount, data.currency)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between font-semibold">
            <span>Total room charges</span>
            <span>{formatMoney(data.total, data.currency)}</span>
          </p>
        </>
      )}
    </Dialog>
  );
}

/** One booking with the actions its status allows. Shared by the overview and the bookings list. */
export function StaffBookingRow({ booking }: { booking: RoomBookingDto }) {
  const setStatus = useSetRoomBookingStatus();
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [changingRoom, setChangingRoom] = useState(false);
  const [showFolio, setShowFolio] = useState(false);
  const next = ROOM_BOOKING_TRANSITIONS[booking.status];
  const canMove = booking.status === "PENDING" || booking.status === "CONFIRMED";

  const act = async (status: RoomBookingStatus) => {
    setError(null);
    try {
      await setStatus.mutateAsync({ id: booking.id, status });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the booking.");
    }
  };

  return (
    <li className="space-y-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {booking.guestName} <BookingStatusBadge status={booking.status} />
          </p>
          <p className="text-sm text-muted-foreground">
            {booking.roomTypeName}
            {booking.roomNumber ? ` · Room ${booking.roomNumber}` : " · no room"} ·{" "}
            {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)} ({booking.nights}n) ·{" "}
            {booking.adults + booking.children} guests
          </p>
          <p className="text-sm text-muted-foreground">
            {booking.guestPhone} · <span className="font-mono">{booking.reference}</span> ·{" "}
            {formatMoney(booking.total, booking.currency)}
            {booking.paymentStatus === "UNPAID" &&
              booking.deposit > 0 &&
              ` (deposit ${formatMoney(booking.deposit, booking.currency)} due)`}
          </p>
          {booking.specialRequests && <p className="text-sm">“{booking.specialRequests}”</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {next.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={status === "CANCELLED" || status === "NO_SHOW" ? "outline" : "primary"}
              disabled={setStatus.isPending}
              onClick={() => (status === "CANCELLED" ? setConfirmCancel(true) : void act(status))}
            >
              {ACTION_LABELS[status]}
            </Button>
          ))}
          {canMove && (
            <Button size="sm" variant="ghost" onClick={() => setChangingRoom(true)}>
              Change room
            </Button>
          )}
          {(booking.status === "CHECKED_IN" || booking.status === "CHECKED_OUT") && (
            <Button size="sm" variant="ghost" onClick={() => setShowFolio(true)}>
              Room charges
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {showFolio && <FolioDialog booking={booking} onClose={() => setShowFolio(false)} />}
      {changingRoom && (
        <ChangeRoomDialog booking={booking} onClose={() => setChangingRoom(false)} />
      )}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this booking?"
        description={`${booking.guestName}, ${formatDate(booking.checkIn)} → ${formatDate(booking.checkOut)}. The room is released.`}
        confirmLabel="Cancel booking"
        onConfirm={() => setStatus.mutateAsync({ id: booking.id, status: "CANCELLED" })}
      />
    </li>
  );
}
