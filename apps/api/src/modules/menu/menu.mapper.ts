import {
  MEAL_PERIOD_WINDOWS,
  MEAL_PERIODS,
  type MealPeriod,
  type MenuCategoryDto,
  type MenuItemDto,
} from "@smartdine/shared";
import type { MenuCategory, Prisma } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

import { toNumber } from "../../utils/prisma";

export const menuItemInclude = {
  category: { select: { name: true } },
  allergens: { select: { id: true, name: true }, orderBy: { name: "asc" } },
  modifiers: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
} satisfies Prisma.MenuItemInclude;

export type MenuItemRecord = Prisma.MenuItemGetPayload<{ include: typeof menuItemInclude }>;

export function currentMealPeriod(timezone: string, now = new Date()): MealPeriod {
  const hour = Number(formatInTimeZone(now, timezone, "H"));
  return (
    MEAL_PERIODS.find(
      (p) => hour >= MEAL_PERIOD_WINDOWS[p].from && hour < MEAL_PERIOD_WINDOWS[p].to,
    ) ?? "DINNER"
  );
}

export function toMenuItemDto(
  item: MenuItemRecord,
  options: { timezone: string; includeCost?: boolean; now?: Date },
): MenuItemDto {
  const price = Number(item.price);
  const compare = toNumber(item.comparePrice);
  const discountPercent =
    compare !== null && compare > price ? Math.round(((compare - price) / compare) * 100) : null;
  const inPeriod =
    item.mealPeriods.length === 0 ||
    item.mealPeriods.includes(currentMealPeriod(options.timezone, options.now));

  return {
    id: item.id,
    branchId: item.branchId,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    name: item.name,
    slug: item.slug,
    description: item.description,
    shortDescription: item.shortDescription,
    price,
    comparePrice: compare,
    discountPercent,
    image: item.image,
    gallery: item.gallery,
    preparationTime: item.preparationTime,
    calories: item.calories,
    spiceLevel: item.spiceLevel,
    vegetarian: item.vegetarian,
    vegan: item.vegan,
    halal: item.halal,
    featured: item.featured,
    popular: item.popular,
    newItem: item.newItem,
    availability: item.availability,
    mealPeriods: item.mealPeriods,
    isAvailableNow: item.availability === "AVAILABLE" && inPeriod,
    kitchenStation: item.kitchenStation,
    allergens: item.allergens,
    tags: item.tags,
    // Managers (who also see cost) can edit hidden modifiers; everyone else only sees active ones.
    modifiers: item.modifiers
      .filter((m) => m.isActive || options.includeCost)
      .map((m) => ({
        id: m.id,
        name: m.name,
        priceDelta: Number(m.priceDelta),
        isActive: m.isActive,
      })),
    ...(options.includeCost && { costPrice: toNumber(item.costPrice) }),
  };
}

export const toCategoryDto = (c: MenuCategory): MenuCategoryDto => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  description: c.description,
  sortOrder: c.sortOrder,
  isActive: c.isActive,
});
