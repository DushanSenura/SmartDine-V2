import {
  SocketEvents,
  type AvailabilityStatus,
  type CreateCategoryInput,
  type CreateMenuItemInput,
  type MenuQuery,
  type UpdateCategoryInput,
  type UpdateMenuItemInput,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import { isUniqueViolation, escapeLike } from "../../utils/prisma";
import { slugify } from "../../utils/slug";
import { menuItemInclude, toCategoryDto, toMenuItemDto, type MenuItemRecord } from "./menu.mapper";

async function loadBranch(branchId: string) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
  if (!branch) throw AppError.notFound("Branch not found.");
  return branch;
}

async function loadItem(auth: AuthContext, id: string): Promise<MenuItemRecord> {
  const item = await prisma.menuItem.findFirst({
    where: { id, deletedAt: null },
    include: menuItemInclude,
  });
  if (!item) throw AppError.notFound("Menu item not found.");
  assertBranchAccess(auth, item.branchId);
  return item;
}

async function uniqueSlug(branchId: string, name: string): Promise<string> {
  const base = slugify(name);
  const taken = await prisma.menuItem.findMany({
    where: { branchId, deletedAt: null, slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function assertCategory(categoryId: string) {
  if (!(await prisma.menuCategory.findUnique({ where: { id: categoryId } }))) {
    throw AppError.validation("The selected category does not exist.");
  }
}

async function assertAllergens(ids: string[]) {
  if (ids.length && (await prisma.allergen.count({ where: { id: { in: ids } } })) !== ids.length) {
    throw AppError.validation("An allergen does not exist.");
  }
}

function publicFilters(query: MenuQuery): Prisma.MenuItemWhereInput {
  return {
    ...(query.category && { category: { slug: query.category } }),
    ...(query.vegetarian && { vegetarian: true }),
    ...(query.vegan && { vegan: true }),
    ...(query.halal && { halal: true }),
    ...(query.spicy && { spiceLevel: { gte: 1 } }),
    ...(query.featured && { featured: true }),
    ...(query.popular && { popular: true }),
    ...(query.isNew && { newItem: true }),
    ...(query.q && {
      OR: [
        { name: { contains: escapeLike(query.q), mode: "insensitive" } },
        { description: { contains: escapeLike(query.q), mode: "insensitive" } },
        { shortDescription: { contains: escapeLike(query.q), mode: "insensitive" } },
        { tags: { has: query.q.toLowerCase() } },
      ],
    }),
  };
}

export const menuService = {
  // ── Public ───────────────────────────────────────────────────────
  async publicMenu(query: MenuQuery) {
    const branch = await loadBranch(query.branchId);
    const [categories, items] = await Promise.all([
      prisma.menuCategory.findMany({
        where: { isActive: true, items: { some: { branchId: branch.id, deletedAt: null } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.menuItem.findMany({
        where: {
          branchId: branch.id,
          deletedAt: null,
          category: { isActive: true },
          ...publicFilters(query),
        },
        include: menuItemInclude,
        orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
        take: 500,
      }),
    ]);
    return {
      categories: categories.map(toCategoryDto),
      items: items.map((i) => toMenuItemDto(i, { timezone: branch.timezone })),
    };
  },

  async publicItem(branchId: string, slug: string) {
    const branch = await loadBranch(branchId);
    const item = await prisma.menuItem.findFirst({
      where: { branchId, slug, deletedAt: null, category: { isActive: true } },
      include: menuItemInclude,
    });
    if (!item) throw AppError.notFound("Dish not found.");
    const related = await prisma.menuItem.findMany({
      where: {
        branchId,
        deletedAt: null,
        categoryId: item.categoryId,
        id: { not: item.id },
        availability: "AVAILABLE",
      },
      include: menuItemInclude,
      orderBy: [{ popular: "desc" }, { featured: "desc" }, { name: "asc" }],
      take: 4,
    });
    const dto = (i: MenuItemRecord) => toMenuItemDto(i, { timezone: branch.timezone });
    return { item: dto(item), related: related.map(dto) };
  },

  async allergens() {
    return prisma.allergen.findMany({ orderBy: { name: "asc" } });
  },

  async publicCategories() {
    const categories = await prisma.menuCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return categories.map(toCategoryDto);
  },

  // ── Staff: items ─────────────────────────────────────────────────
  /** Every item of a branch, including unavailable ones. `costPrice` only for menu managers. */
  async adminList(auth: AuthContext, branchId: string | undefined, includeCost: boolean) {
    const scoped = requireBranch(auth, branchId);
    const branch = await loadBranch(scoped);
    const items = await prisma.menuItem.findMany({
      where: { branchId: scoped, deletedAt: null },
      include: menuItemInclude,
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    });
    return items.map((i) => toMenuItemDto(i, { timezone: branch.timezone, includeCost }));
  },

  async create(auth: AuthContext, input: CreateMenuItemInput) {
    assertBranchAccess(auth, input.branchId);
    const branch = await loadBranch(input.branchId);
    await assertCategory(input.categoryId);
    await assertAllergens(input.allergenIds);
    const { allergenIds, comparePrice, costPrice, modifiers, ...rest } = input;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const item = await prisma.menuItem.create({
          data: {
            ...rest,
            comparePrice: comparePrice ?? null,
            costPrice: costPrice ?? null,
            slug: await uniqueSlug(input.branchId, input.name),
            allergens: { connect: allergenIds.map((id) => ({ id })) },
            modifiers: { create: modifiers.map((m, sortOrder) => ({ ...m, sortOrder })) },
          },
          include: menuItemInclude,
        });
        const dto = toMenuItemDto(item, { timezone: branch.timezone, includeCost: true });
        this.broadcast(item);
        return dto;
      } catch (error) {
        if (isUniqueViolation(error)) continue; // slug raced with another create; recompute
        throw error;
      }
    }
    throw AppError.conflict("SLUG_CONFLICT", "Could not allocate a unique URL for this dish.");
  },

  async update(auth: AuthContext, id: string, input: UpdateMenuItemInput) {
    const existing = await loadItem(auth, id);
    if (input.categoryId) await assertCategory(input.categoryId);
    if (input.allergenIds) await assertAllergens(input.allergenIds);
    const branch = await loadBranch(existing.branchId);
    const { allergenIds, modifiers, ...rest } = input;

    const item = await prisma.menuItem.update({
      where: { id },
      data: {
        ...rest,
        // Vegan implies vegetarian.
        ...(rest.vegan === true && { vegetarian: true }),
        ...(allergenIds && { allergens: { set: allergenIds.map((a) => ({ id: a })) } }),
        // Past orders hold their own snapshot, so the list can simply be replaced.
        ...(modifiers && {
          modifiers: {
            deleteMany: {},
            create: modifiers.map((m, sortOrder) => ({ ...m, sortOrder })),
          },
        }),
      },
      include: menuItemInclude,
    });
    this.broadcast(item);
    if (input.price !== undefined && Number(input.price) !== Number(existing.price)) {
      void audit(auth, {
        action: "menu.price_changed",
        entity: "menu_item",
        entityId: id,
        branchId: existing.branchId,
        previousValue: { name: existing.name, price: Number(existing.price) },
        newValue: { name: item.name, price: Number(item.price) },
      });
    }
    return toMenuItemDto(item, { timezone: branch.timezone, includeCost: true });
  },

  /** Instant availability switch (kitchen / manager); pushed live to every staff screen. */
  async setAvailability(auth: AuthContext, id: string, availability: AvailabilityStatus) {
    const existing = await loadItem(auth, id);
    const branch = await loadBranch(existing.branchId);
    const item = await prisma.menuItem.update({
      where: { id },
      data: { availability },
      include: menuItemInclude,
    });
    this.broadcast(item);
    return toMenuItemDto(item, { timezone: branch.timezone });
  },

  async remove(auth: AuthContext, id: string) {
    const existing = await loadItem(auth, id);
    await prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date() } });
    emitToBranch(existing.branchId, SocketEvents.MENU_ITEM_UPDATED, { id, deleted: true });
  },

  /** Staff broadcast never includes cost data. */
  broadcast(item: MenuItemRecord) {
    // Timezone is not needed for the socket payload's flags beyond isAvailableNow; UTC is fine.
    emitToBranch(
      item.branchId,
      SocketEvents.MENU_ITEM_UPDATED,
      toMenuItemDto(item, { timezone: "UTC" }),
    );
  },

  // ── Staff: categories ────────────────────────────────────────────
  async adminCategories() {
    const categories = await prisma.menuCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return categories.map(toCategoryDto);
  },

  async createCategory(input: CreateCategoryInput) {
    const base = slugify(input.name);
    for (let n = 1; n < 50; n++) {
      try {
        return toCategoryDto(
          await prisma.menuCategory.create({
            data: { ...input, slug: n === 1 ? base : `${base}-${n}` },
          }),
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw AppError.conflict("SLUG_CONFLICT", "Could not allocate a unique URL for this category.");
  },

  async updateCategory(id: string, input: UpdateCategoryInput) {
    try {
      return toCategoryDto(await prisma.menuCategory.update({ where: { id }, data: input }));
    } catch {
      throw AppError.notFound("Category not found.");
    }
  },

  async deleteCategory(id: string) {
    const items = await prisma.menuItem.count({ where: { categoryId: id, deletedAt: null } });
    if (items > 0) {
      throw AppError.conflict(
        "CATEGORY_NOT_EMPTY",
        "Move or remove the dishes in this category first.",
      );
    }
    try {
      const { count } = await prisma.menuCategory.deleteMany({ where: { id } });
      if (count === 0) throw AppError.notFound("Category not found.");
    } catch (error) {
      if (error instanceof AppError) throw error;
      // Only soft-deleted dishes still reference it: hide the category instead of deleting.
      await prisma.menuCategory.update({ where: { id }, data: { isActive: false } });
    }
  },
};
