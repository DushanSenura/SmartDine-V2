import type { TableStatus } from "@smartdine/shared";
import {
  Brush,
  CalendarClock,
  CircleCheck,
  CircleSlash,
  CreditCard,
  Hourglass,
  NotebookPen,
  Utensils,
  type LucideIcon,
} from "lucide-react";

interface StatusStyle {
  label: string;
  icon: LucideIcon;
  /** Border + fill. Status is always also conveyed by the icon and label, never colour alone. */
  className: string;
}

export const TABLE_STATUS_STYLES: Record<TableStatus, StatusStyle> = {
  AVAILABLE: { label: "Available", icon: CircleCheck, className: "border-success bg-success/15" },
  RESERVED: { label: "Reserved", icon: CalendarClock, className: "border-info bg-info/15" },
  OCCUPIED: { label: "Occupied", icon: Utensils, className: "border-warning bg-warning/25" },
  ORDERING: { label: "Ordering", icon: NotebookPen, className: "border-warning bg-warning/25" },
  WAITING_FOR_FOOD: {
    label: "Waiting for food",
    icon: Hourglass,
    className: "border-warning bg-warning/25",
  },
  DINING: { label: "Dining", icon: Utensils, className: "border-primary bg-primary/15" },
  PAYMENT_PENDING: {
    label: "Payment pending",
    icon: CreditCard,
    className: "border-accent bg-accent/30",
  },
  CLEANING: {
    label: "Cleaning",
    icon: Brush,
    className: "border-muted-foreground bg-surface-muted",
  },
  OUT_OF_SERVICE: {
    label: "Out of service",
    icon: CircleSlash,
    className: "border-danger border-dashed bg-danger/10 opacity-75",
  },
};
