import { BILL_STATUS_LABELS, type BillStatus } from "@smartdine/shared";
import { motion } from "motion/react";

import { Badge } from "@/components/ui/Badge";

const TONES: Record<BillStatus, "neutral" | "warning" | "success" | "danger"> = {
  OPEN: "warning",
  PAID: "success",
  REFUNDED: "neutral",
  VOID: "danger",
};

/** Re-keyed on status so a payment landing animates the badge instead of swapping it. */
export const BillStatusBadge = ({ status }: { status: BillStatus }) => (
  <motion.span
    key={status}
    initial={{ opacity: 0, y: -4, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.22 }}
    className="inline-block"
  >
    <Badge tone={TONES[status]}>{BILL_STATUS_LABELS[status]}</Badge>
  </motion.span>
);
