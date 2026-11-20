export const STOCK_TRANSACTION_TYPES = [
  "PURCHASE",
  "USE",
  "WASTE",
  "ADJUSTMENT",
  "TRANSFER",
  "RETURN",
] as const;
export type StockTransactionType = (typeof STOCK_TRANSACTION_TYPES)[number];

export const STOCK_TRANSACTION_LABELS: Record<StockTransactionType, string> = {
  PURCHASE: "Purchase",
  USE: "Used",
  WASTE: "Waste",
  ADJUSTMENT: "Stock count",
  TRANSFER: "Transfer",
  RETURN: "Returned to supplier",
};

export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const INVENTORY_STATUSES = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "EXPIRING"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  EXPIRING: "Expiring soon",
};

/** Stock expiring within this many days is flagged. */
export const EXPIRY_WARNING_DAYS = 7;

/** Types that take stock out of the branch. */
const OUTGOING: readonly StockTransactionType[] = ["USE", "WASTE", "RETURN", "TRANSFER"];

/** Signed change a movement makes to the quantity on hand (ADJUSTMENT is computed from a count instead). */
export function stockDelta(type: Exclude<StockTransactionType, "ADJUSTMENT">, quantity: number) {
  return OUTGOING.includes(type) ? -quantity : quantity;
}

export interface StockLevel {
  quantity: number;
  minimumQuantity: number;
  /** YYYY-MM-DD */
  expiryDate: string | null;
}

/**
 * One status per item, most urgent first: nothing left, then expired / expiring, then below the
 * reorder level. `today` is the branch-local date (YYYY-MM-DD).
 */
export function inventoryStatus(level: StockLevel, today: string): InventoryStatus {
  if (level.quantity <= 0) return "OUT_OF_STOCK";
  if (level.expiryDate) {
    const days = Math.round((Date.parse(level.expiryDate) - Date.parse(today)) / 86_400_000);
    if (days <= EXPIRY_WARNING_DAYS) return "EXPIRING";
  }
  if (level.quantity <= level.minimumQuantity) return "LOW_STOCK";
  return "IN_STOCK";
}
