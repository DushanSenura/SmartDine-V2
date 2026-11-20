import { z } from "zod";

import { KITCHEN_STATIONS, type KitchenStation } from "../constants/menu";
import {
  ORDER_RULES,
  ORDER_STATUSES,
  ORDER_TYPES,
  type KitchenPriority,
  type OrderItemStatus,
  type OrderStatus,
  type OrderType,
} from "../constants/orders";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const orderLine = z.object({
  menuItemId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(ORDER_RULES.maxQuantityPerItem).default(1),
  notes: optionalText(300),
  modifierIds: z.array(z.uuid()).max(20).default([]),
});

export const createOrderSchema = z
  .object({
    branchId: z.uuid().optional(),
    type: z.enum(ORDER_TYPES),
    tableId: z.uuid().optional(),
    roomId: z.uuid().optional(),
    guestName: optionalText(120),
    guestCount: z.coerce.number().int().min(1).max(50).nullable().optional(),
    kitchenInstructions: optionalText(500),
    items: z.array(orderLine).max(ORDER_RULES.maxItemsPerOrder).default([]),
  })
  .refine((v) => (v.type === "DINE_IN" ? !!v.tableId && !v.roomId : !!v.roomId && !v.tableId), {
    message: "Dine-in orders need a table; room-service orders need a room.",
    path: ["type"],
  });

/** A customer ordering from their table: the table number they see, and optionally their waiter. */
export const tableOrderSchema = z.object({
  branchId: z.uuid(),
  tableNumber: z.string().trim().min(1, "Enter your table number.").max(16),
  waiterId: z.uuid().optional(),
  guestName: optionalText(120),
  kitchenInstructions: optionalText(500),
  items: z
    .array(orderLine)
    .min(1, "Choose at least one dish.")
    .max(ORDER_RULES.maxItemsPerOrder),
});

export const tableLookupQuerySchema = z.object({
  branchId: z.uuid(),
  tableNumber: z.string().trim().min(1).max(16),
});

export const waiterOptionsQuerySchema = z.object({ branchId: z.uuid() });

export const updateOrderSchema = z.object({
  guestName: optionalText(120),
  guestCount: z.coerce.number().int().min(1).max(50).nullable().optional(),
  kitchenInstructions: optionalText(500),
});

export const addItemsSchema = z.object({
  items: z.array(orderLine).min(1).max(ORDER_RULES.maxItemsPerOrder),
});

export const updateItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(ORDER_RULES.maxQuantityPerItem).optional(),
  notes: optionalText(300),
});

export const reasonSchema = z.object({ reason: optionalText(300) });

export const orderListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  scope: z.enum(["active", "history"]).default("active"),
  status: z.enum(ORDER_STATUSES).optional(),
  tableId: z.uuid().optional(),
});

export const kitchenQuerySchema = z.object({
  branchId: z.uuid().optional(),
  station: z.enum(KITCHEN_STATIONS).optional(),
});

export const kitchenItemStatusSchema = z.object({
  status: z.enum(["PREPARING", "PREPARED"] as const),
});

export type TableOrderInput = z.infer<typeof tableOrderSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderLineInput = z.infer<typeof orderLine>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export interface OrderItemDto {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  status: OrderItemStatus;
  station: KitchenStation;
  modifiers: { name: string; priceDelta: number }[];
  allergens: string[];
  /** Which ordering round the item was added in (1 = first). */
  round: number;
}

export interface OrderHistoryDto {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  userName: string | null;
  createdAt: string;
}

/** A waiter a customer may choose when ordering. */
export interface WaiterOptionDto {
  id: string;
  name: string;
}

/** What a customer learns about a table number before ordering. */
export interface TableLookupDto {
  tableNumber: string;
  section: string | null;
  /** The waiter already looking after this table, if any. */
  assignedWaiterId: string | null;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  branchId: string;
  type: OrderType;
  status: OrderStatus;
  tableId: string | null;
  tableNumber: string | null;
  roomId: string | null;
  roomNumber: string | null;
  guestName: string | null;
  guestCount: number | null;
  waiterId: string;
  waiterName: string;
  /** True when the customer placed this order themselves from the table. */
  selfOrdered: boolean;
  kitchenInstructions: string | null;
  subtotal: number;
  currency: string;
  items: OrderItemDto[];
  createdAt: string;
  sentToKitchenAt: string | null;
  servedAt: string | null;
  paymentRequestedAt: string | null;
  /** Present on the detail endpoint only. */
  history?: OrderHistoryDto[];
}

/** What the kitchen sees: no prices or money of any kind. */
export interface KitchenItemDto {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  status: OrderItemStatus;
  station: KitchenStation;
  modifiers: string[];
  allergens: string[];
  round: number;
  startedAt: string | null;
  preparedAt: string | null;
}

export interface KitchenTicketDto {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  /** "Table 5" or "Room 201". */
  location: string;
  waiterName: string;
  guestCount: number | null;
  kitchenInstructions: string | null;
  sentAt: string;
  /** Minutes since the order was sent, at the time of the request. */
  elapsedMinutes: number;
  priority: KitchenPriority;
  items: KitchenItemDto[];
}
