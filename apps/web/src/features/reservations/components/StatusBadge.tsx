import { RESERVATION_STATUS_LABELS, type ReservationStatus } from "@smartdine/shared";
import { motion } from "motion/react";

import { Badge } from "@/components/ui/Badge";

const TONES = {
  PENDING: "warning",
  CONFIRMED: "success",
  CHECKED_IN: "info",
  SEATED: "info",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
} as const;

/** Re-keyed on status so a change animates in rather than swapping instantly. */
export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, y: -4, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22 }}
      className="inline-block"
    >
      <Badge tone={TONES[status]}>{RESERVATION_STATUS_LABELS[status]}</Badge>
    </motion.span>
  );
}
