import {
  ORDER_ITEM_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PRIORITY_LABELS,
  type KitchenPriority,
  type OrderItemStatus,
  type OrderStatus,
} from "@smartdine/shared";
import { CircleAlert, CircleCheck, Clock, Flame } from "lucide-react";
import { motion } from "motion/react";

import { Badge } from "@/components/ui/Badge";

const ORDER_TONES: Record<OrderStatus, "neutral" | "warning" | "info" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  SENT_TO_KITCHEN: "info",
  PREPARING: "warning",
  PARTIALLY_READY: "warning",
  READY_TO_SERVE: "success",
  PARTIALLY_SERVED: "info",
  SERVED: "success",
  PAYMENT_REQUESTED: "warning",
  PAID: "success",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  REFUNDED: "neutral",
  VOID: "danger",
};

const ITEM_TONES: Record<OrderItemStatus, "neutral" | "warning" | "success" | "info" | "danger"> = {
  PENDING: "neutral",
  PREPARING: "warning",
  PREPARED: "success",
  SERVED: "info",
  CANCELLED: "danger",
};

/** Re-keyed on status so a change animates in instead of swapping instantly. */
function Animated({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <motion.span
      key={id}
      initial={{ opacity: 0, y: -4, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22 }}
      className="inline-block"
    >
      {children}
    </motion.span>
  );
}

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <Animated id={status}>
    <Badge tone={ORDER_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
  </Animated>
);

export const ItemStatusBadge = ({ status }: { status: OrderItemStatus }) => (
  <Animated id={status}>
    <Badge tone={ITEM_TONES[status]}>{ORDER_ITEM_STATUS_LABELS[status]}</Badge>
  </Animated>
);

const PRIORITY_ICONS = { NORMAL: Clock, ATTENTION: CircleAlert, URGENT: Flame } as const;
const PRIORITY_TONES = { NORMAL: "neutral", ATTENTION: "warning", URGENT: "danger" } as const;

/** Urgency is shown with an icon and a word as well as a colour. */
export function PriorityBadge({ priority }: { priority: KitchenPriority }) {
  const Icon = PRIORITY_ICONS[priority];
  return (
    <Animated id={priority}>
      <Badge tone={PRIORITY_TONES[priority]} className="gap-1">
        <Icon className="size-3.5" aria-hidden />
        {PRIORITY_LABELS[priority]}
      </Badge>
    </Animated>
  );
}

export const ReadyMark = () => <CircleCheck className="size-4 text-success" aria-hidden />;
