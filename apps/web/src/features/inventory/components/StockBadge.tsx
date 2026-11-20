import { INVENTORY_STATUS_LABELS, type InventoryStatus } from "@smartdine/shared";
import { CircleAlert, CircleCheck, Clock, PackageX } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

const STYLES: Record<InventoryStatus, { icon: typeof CircleCheck; className: string }> = {
  IN_STOCK: { icon: CircleCheck, className: "bg-success/15 text-success" },
  LOW_STOCK: { icon: CircleAlert, className: "bg-warning/20 text-foreground" },
  OUT_OF_STOCK: { icon: PackageX, className: "bg-danger/15 text-danger" },
  EXPIRING: { icon: Clock, className: "bg-warning/20 text-foreground" },
};

/** Icon and label, never colour alone; re-keyed so a change in level animates in. */
export function StockBadge({ status }: { status: InventoryStatus }) {
  const { icon: Icon, className } = STYLES[status];
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {INVENTORY_STATUS_LABELS[status]}
    </motion.span>
  );
}
