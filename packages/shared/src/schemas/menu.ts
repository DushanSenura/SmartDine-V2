import { z } from "zod";

import { httpUrl } from "./common";

import {
  AVAILABILITY_STATUSES,
  KITCHEN_STATIONS,
  MEAL_PERIODS,
  type AvailabilityStatus,
  type KitchenStation,
  type MealPeriod,
} from "../constants/menu";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const price = z.coerce.number().min(0).max(1_000_000);
const optionalPrice = z.union([z.literal("").transform(() => null), z.null(), price]).optional();

// ── Categories ───────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: text(60).min(1, "Required"),
  description: optionalText(300),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});
export const updateCategorySchema = createCategorySchema.partial();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export interface MenuCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

// ── Menu items ───────────────────────────────────────────────────

export const modifierInputSchema = z.object({
  name: text(60).min(1, "Required"),
  priceDelta: z.coerce.number().min(-100_000).max(100_000).default(0),
  isActive: z.boolean().default(true),
});

export const createMenuItemSchema = z
  .object({
    branchId: z.uuid(),
    categoryId: z.uuid(),
    name: text(120).min(1, "Required"),
    description: optionalText(2000),
    shortDescription: optionalText(160),
    price,
    comparePrice: optionalPrice,
    costPrice: optionalPrice,
    image: httpUrl.nullable().optional(),
    gallery: z.array(httpUrl).max(10).default([]),
    preparationTime: z.coerce.number().int().min(0).max(300).nullable().optional(),
    calories: z.coerce.number().int().min(0).max(10_000).nullable().optional(),
    spiceLevel: z.coerce.number().int().min(0).max(3).default(0),
    vegetarian: z.boolean().default(false),
    vegan: z.boolean().default(false),
    halal: z.boolean().default(false),
    featured: z.boolean().default(false),
    popular: z.boolean().default(false),
    newItem: z.boolean().default(false),
    availability: z.enum(AVAILABILITY_STATUSES).default("AVAILABLE"),
    mealPeriods: z.array(z.enum(MEAL_PERIODS)).max(3).default([]),
    kitchenStation: z.enum(KITCHEN_STATIONS).default("MAIN_KITCHEN"),
    allergenIds: z.array(z.uuid()).max(20).default([]),
    tags: z.array(text(30).min(1)).max(15).default([]),
    modifiers: z.array(modifierInputSchema).max(30).default([]),
  })
  // A vegan dish is by definition vegetarian.
  .transform((v) => ({ ...v, vegetarian: v.vegetarian || v.vegan }));

export const updateMenuItemSchema = z.object({
  categoryId: z.uuid().optional(),
  name: text(120).min(1).optional(),
  description: optionalText(2000),
  shortDescription: optionalText(160),
  price: price.optional(),
  comparePrice: optionalPrice,
  costPrice: optionalPrice,
  image: httpUrl.nullable().optional(),
  gallery: z.array(httpUrl).max(10).optional(),
  preparationTime: z.coerce.number().int().min(0).max(300).nullable().optional(),
  calories: z.coerce.number().int().min(0).max(10_000).nullable().optional(),
  spiceLevel: z.coerce.number().int().min(0).max(3).optional(),
  vegetarian: z.boolean().optional(),
  vegan: z.boolean().optional(),
  halal: z.boolean().optional(),
  featured: z.boolean().optional(),
  popular: z.boolean().optional(),
  newItem: z.boolean().optional(),
  availability: z.enum(AVAILABILITY_STATUSES).optional(),
  mealPeriods: z.array(z.enum(MEAL_PERIODS)).max(3).optional(),
  kitchenStation: z.enum(KITCHEN_STATIONS).optional(),
  allergenIds: z.array(z.uuid()).max(20).optional(),
  tags: z.array(text(30).min(1)).max(15).optional(),
  /** Replaces the dish's modifier list. Past orders keep their own snapshot. */
  modifiers: z.array(modifierInputSchema).max(30).optional(),
});

export const updateAvailabilitySchema = z.object({ availability: z.enum(AVAILABILITY_STATUSES) });

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export interface AllergenDto {
  id: string;
  name: string;
}

export interface ModifierDto {
  id: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
}

export interface MenuItemDto {
  id: string;
  branchId: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  price: number;
  comparePrice: number | null;
  /** Percentage off `comparePrice`, rounded; null when there is no discount. */
  discountPercent: number | null;
  image: string | null;
  gallery: string[];
  preparationTime: number | null;
  calories: number | null;
  spiceLevel: number;
  vegetarian: boolean;
  vegan: boolean;
  halal: boolean;
  featured: boolean;
  popular: boolean;
  newItem: boolean;
  availability: AvailabilityStatus;
  mealPeriods: MealPeriod[];
  /** AVAILABLE and inside its meal period right now (branch local time). */
  isAvailableNow: boolean;
  kitchenStation: KitchenStation;
  allergens: AllergenDto[];
  tags: string[];
  /** Optional choices ("Extra cheese", "Well done"); active ones only on public views. */
  modifiers: ModifierDto[];
  /** Staff views only. */
  costPrice?: number | null;
}

// ── Public menu query ────────────────────────────────────────────

const flag = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

export const menuQuerySchema = z.object({
  branchId: z.uuid(),
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  vegetarian: flag,
  vegan: flag,
  halal: flag,
  spicy: flag,
  featured: flag,
  popular: flag,
  isNew: flag,
});
export type MenuQuery = z.infer<typeof menuQuerySchema>;

export interface PublicMenuDto {
  categories: MenuCategoryDto[];
  items: MenuItemDto[];
}
