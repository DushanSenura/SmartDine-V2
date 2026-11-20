import { z } from "zod";

import {
  INVENTORY_STATUSES,
  STOCK_TRANSACTION_TYPES,
  SUPPLIER_STATUSES,
  type InventoryStatus,
  type StockTransactionType,
  type SupplierStatus,
} from "../constants/inventory";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const quantity = z.coerce.number().min(0).max(1_000_000);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// Field definitions carry no defaults: `.partial()` would keep them and a PATCH that omitted a
// field would silently reset it. Create schemas add their defaults on top.
const supplierFields = {
  name: text(120).min(1, "Required"),
  contactPerson: optionalText(120),
  email: z
    .union([z.literal(""), z.email()])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  phone: optionalText(40),
  address: optionalText(300),
  products: z.array(text(60).min(1)).max(40),
  status: z.enum(SUPPLIER_STATUSES),
  notes: optionalText(1000),
};
export const supplierSchema = z.object({
  ...supplierFields,
  products: supplierFields.products.default([]),
  status: supplierFields.status.default("ACTIVE"),
});
export const updateSupplierSchema = z.object(supplierFields).partial();

const itemFields = {
  name: text(120).min(1, "Required"),
  sku: text(40)
    .min(1, "Required")
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._-]*$/, "Letters, numbers and - . _ only")),
  category: text(60).min(1, "Required"),
  unit: text(16).min(1, "Required"),
  minimumQuantity: quantity,
  cost: z.coerce.number().min(0).max(10_000_000),
  supplierId: z.uuid().nullable().optional(),
  expiryDate: dateOnly.nullable().optional(),
  storageLocation: optionalText(120),
};

export const createInventoryItemSchema = z.object({
  branchId: z.uuid().optional(),
  ...itemFields,
  minimumQuantity: itemFields.minimumQuantity.default(0),
  cost: itemFields.cost.default(0),
  /** Opening stock; recorded as a purchase so the audit trail starts at zero. */
  quantity: quantity.default(0),
});
export const updateInventoryItemSchema = z.object(itemFields).partial();

const movementBase = { note: optionalText(300), reference: optionalText(80) };

/** A stock movement. `ADJUSTMENT` states what was counted; the others state how much moved. */
export const stockMovementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["PURCHASE", "USE", "WASTE", "RETURN"]),
    quantity: z.coerce.number().positive().max(1_000_000),
    unitCost: z.coerce.number().min(0).max(10_000_000).optional(),
    ...movementBase,
  }),
  z.object({
    type: z.literal("ADJUSTMENT"),
    countedQuantity: quantity,
    ...movementBase,
  }),
  z.object({
    type: z.literal("TRANSFER"),
    quantity: z.coerce.number().positive().max(1_000_000),
    toBranchId: z.uuid(),
    ...movementBase,
  }),
]);

export const inventoryListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  status: z.enum(INVENTORY_STATUSES).optional(),
  category: z.string().trim().max(60).optional(),
  q: z.string().trim().max(80).optional(),
});

export const stockTransactionQuerySchema = z.object({
  branchId: z.uuid().optional(),
  itemId: z.uuid().optional(),
  type: z.enum(STOCK_TRANSACTION_TYPES).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export interface SupplierDto {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  products: string[];
  status: SupplierStatus;
  notes: string | null;
  itemCount: number;
}

export interface InventoryItemDto {
  id: string;
  branchId: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  quantity: number;
  minimumQuantity: number;
  cost: number;
  /** quantity × cost */
  value: number;
  supplierId: string | null;
  supplierName: string | null;
  expiryDate: string | null;
  storageLocation: string | null;
  status: InventoryStatus;
}

export interface StockTransactionDto {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  unit: string;
  type: StockTransactionType;
  quantityChange: number;
  quantityAfter: number;
  unitCost: number | null;
  reference: string | null;
  note: string | null;
  userName: string | null;
  createdAt: string;
}

export interface InventorySummaryDto {
  currency: string;
  itemCount: number;
  lowStock: number;
  outOfStock: number;
  expiring: number;
  stockValue: number;
}
