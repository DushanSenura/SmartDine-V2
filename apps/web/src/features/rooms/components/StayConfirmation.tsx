import { ROOM_BOOKING_STATUS_LABELS, type RoomBookingDto } from "@smartdine/shared";
import { CircleCheck } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";

import { formatDate, formatMoney } from "@/utils/format";

export function StayConfirmation({
  booking,
  onAnother,
}: {
  booking: RoomBookingDto;
  onAnother: () => void;
}) {
  const money = (n: number) => formatMoney(n, booking.currency);
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      aria-labelledby="stay-confirmed"
      className="space-y-5 rounded-xl border border-border bg-surface p-6 sm:p-8"
    >
      <div className="flex items-center gap-3">
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
          className="grid size-12 place-items-center rounded-full bg-success/15 text-success"
        >
          <CircleCheck className="size-7" aria-hidden />
        </motion.span>
        <div>
          <h2 id="stay-confirmed" className="font-display text-2xl font-semibold">
            Your room is booked
          </h2>
          <p role="status" className="text-sm text-muted-foreground">
            Status: {ROOM_BOOKING_STATUS_LABELS[booking.status]}
          </p>
        </div>
      </div>
      <div className="rounded-lg bg-surface-muted p-4">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">Booking reference</p>
        <p className="font-mono text-2xl font-semibold tracking-wider">{booking.reference}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Room</dt>
          <dd className="font-medium">
            {booking.roomTypeName}, {booking.branchName}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Guests</dt>
          <dd className="font-medium">
            {booking.adults} adults{booking.children ? `, ${booking.children} children` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Check-in</dt>
          <dd className="font-medium">
            {formatDate(booking.checkIn)} from {booking.checkInTime}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Check-out</dt>
          <dd className="font-medium">
            {formatDate(booking.checkOut)} by {booking.checkOutTime}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-medium">{money(booking.total)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Deposit due</dt>
          <dd className="font-medium">{money(booking.deposit)}</dd>
        </div>
      </dl>
      <p className="rounded-lg bg-surface-muted p-3 text-sm">
        Your room number is assigned and confirmed at check-in. The deposit is collected by the
        hotel — online payment is coming soon.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/account/stays"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          View my stays
        </Link>
        <button
          type="button"
          onClick={onAnother}
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-muted"
        >
          Book another room
        </button>
      </div>
    </motion.section>
  );
}
