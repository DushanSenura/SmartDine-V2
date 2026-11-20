import { OCCASION_LABELS, RESERVATION_STATUS_LABELS, type ReservationDto } from "@smartdine/shared";
import { CircleCheck } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";

import { formatDateTime, formatMoney, formatTime } from "@/utils/format";

export function ConfirmationCard({
  reservation,
  currency,
  onAnother,
}: {
  reservation: ReservationDto;
  currency: string;
  onAnother: () => void;
}) {
  const isPrivate = reservation.type === "PRIVATE_DINING";
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      aria-labelledby="confirmation-title"
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
          <h2 id="confirmation-title" className="font-display text-2xl font-semibold">
            {isPrivate ? "Request received" : "You're booked"}
          </h2>
          <p className="text-sm text-muted-foreground" role="status">
            {isPrivate
              ? "Our team will confirm your private dining request shortly."
              : `Status: ${RESERVATION_STATUS_LABELS[reservation.status]}`}
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-surface-muted p-4">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">Booking reference</p>
        <p className="font-mono text-2xl font-semibold tracking-wider">{reservation.reference}</p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Where</dt>
          <dd className="font-medium">
            {reservation.branchName}
            {reservation.roomName && ` — ${reservation.roomName}`}
            {reservation.areaName && ` — ${reservation.areaName}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">When</dt>
          <dd className="font-medium">
            {formatDateTime(reservation.startsAt, reservation.timezone)} –{" "}
            {formatTime(reservation.endsAt, reservation.timezone)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Guests</dt>
          <dd className="font-medium">{reservation.partySize}</dd>
        </div>
        {reservation.occasion && (
          <div>
            <dt className="text-muted-foreground">Occasion</dt>
            <dd className="font-medium">{OCCASION_LABELS[reservation.occasion]}</dd>
          </div>
        )}
        {isPrivate && reservation.depositAmount !== null && (
          <div>
            <dt className="text-muted-foreground">Deposit (payable once confirmed)</dt>
            <dd className="font-medium">{formatMoney(reservation.depositAmount, currency)}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          to="/account/reservations"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          View my reservations
        </Link>
        <button
          type="button"
          onClick={onAnother}
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-muted"
        >
          Make another booking
        </button>
      </div>
    </motion.section>
  );
}
