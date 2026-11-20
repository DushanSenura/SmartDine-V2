import {
  inventoryStatus,
  stockDelta,
  type CreateInventoryItemInput,
  type InventoryItemDto,
  type InventoryStatus,
  type InventorySummaryDto,
  type StockMovementInput,
  type StockTransactionDto,
  type StockTransactionType,
  type SupplierDto,
  type SupplierInput,
  type UpdateInventoryItemInput,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { events } from "../notifications/notify.events";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { isUniqueViolation, withResourceLocks, escapeLike } from "../../utils/prisma";
import { parseDateOnly } from "../../utils/dates";
import { localToUtc } from "../reservations/reservation.timing";

const num = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const todayIn = (timezone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
const dateText = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type ItemRecord = Prisma.InventoryItemGetPayload<{
  include: { supplier: { select: { name: true } } };
}>;
const itemInclude = { supplier: { select: { name: true } } } satisfies Prisma.InventoryItemInclude;

function toItemDto(item: ItemRecord, today: string): InventoryItemDto {
  const quantity = Number(item.quantity);
  const minimumQuantity = Number(item.minimumQuantity);
  const cost = Number(item.cost);
  return {
    id: item.id,
    branchId: item.branchId,
    name: item.name,
    sku: item.sku,
    category: item.category,
    unit: item.unit,
    quantity,
    minimumQuantity,
    cost,
    value: Math.round(quantity * cost * 100) / 100,
    supplierId: item.supplierId,
    supplierName: item.supplier?.name ?? null,
    expiryDate: dateText(item.expiryDate),
    storageLocation: item.storageLocation,
    status: inventoryStatus(
      { quantity, minimumQuantity, expiryDate: dateText(item.expiryDate) },
      today,
    ),
  };
}

async function branchContext(branchId: string) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
  if (!branch) throw AppError.notFound("Branch not found.");
  return { branch, today: todayIn(branch.timezone) };
}

async function loadItem(auth: AuthContext, id: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id, deletedAt: null },
    include: itemInclude,
  });
  if (!item) throw AppError.notFound("Stock item not found.");
  assertBranchAccess(auth, item.branchId);
  return item;
}

async function assertSupplier(supplierId: string | null | undefined) {
  if (!supplierId) return;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
  if (!supplier) throw AppError.validation("That supplier doesn't exist.");
}

const skuTaken = () =>
  AppError.conflict("SKU_TAKEN", "Another item in this branch already uses that SKU.");

function transactionData(
  item: { id: string; branchId: string },
  type: StockTransactionType,
  change: number,
  after: number,
  userId: string,
  extra: {
    unitCost?: number | null;
    reference?: string | null;
    note?: string | null;
    counterpartId?: string;
  },
) {
  return {
    itemId: item.id,
    branchId: item.branchId,
    type,
    quantityChange: change,
    quantityAfter: after,
    unitCost: extra.unitCost ?? null,
    reference: extra.reference ?? null,
    note: extra.note ?? null,
    counterpartId: extra.counterpartId ?? null,
    userId,
  };
}

export const inventoryService = {
  // ── Suppliers ────────────────────────────────────────────────────
  async listSuppliers(): Promise<SupplierDto[]> {
    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
      orderBy: { name: "asc" },
    });
    return suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      contactPerson: s.contactPerson,
      email: s.email,
      phone: s.phone,
      address: s.address,
      products: s.products,
      status: s.status,
      notes: s.notes,
      itemCount: s._count.items,
    }));
  },

  async createSupplier(input: SupplierInput) {
    const supplier = await prisma.supplier.create({ data: input });
    return (await inventoryService.listSuppliers()).find((s) => s.id === supplier.id)!;
  },

  async updateSupplier(id: string, input: Partial<SupplierInput>) {
    const existing = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Supplier not found.");
    await prisma.supplier.update({ where: { id }, data: input });
    return (await inventoryService.listSuppliers()).find((s) => s.id === id)!;
  },

  /** Suppliers are archived, never erased: past stock purchases still point at them. */
  async deleteSupplier(id: string) {
    const existing = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Supplier not found.");
    await prisma.$transaction([
      prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } }),
      prisma.inventoryItem.updateMany({ where: { supplierId: id }, data: { supplierId: null } }),
    ]);
  },

  // ── Items ────────────────────────────────────────────────────────
  async listItems(
    auth: AuthContext,
    query: { branchId?: string; status?: InventoryStatus; category?: string; q?: string },
  ) {
    const branchId = requireBranch(auth, query.branchId);
    const { today } = await branchContext(branchId);
    const items = await prisma.inventoryItem.findMany({
      where: {
        branchId,
        deletedAt: null,
        ...(query.category && { category: query.category }),
        ...(query.q && {
          OR: [
            { name: { contains: escapeLike(query.q), mode: "insensitive" } },
            { sku: { contains: escapeLike(query.q), mode: "insensitive" } },
          ],
        }),
      },
      include: itemInclude,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 1000,
    });
    const dtos = items.map((i) => toItemDto(i, today));
    return query.status ? dtos.filter((i) => i.status === query.status) : dtos;
  },

  async summary(auth: AuthContext, requestedBranch?: string): Promise<InventorySummaryDto> {
    const branchId = requireBranch(auth, requestedBranch);
    const { branch } = await branchContext(branchId);
    const items = await inventoryService.listItems(auth, { branchId });
    const count = (status: InventoryStatus) => items.filter((i) => i.status === status).length;
    return {
      currency: branch.currency,
      itemCount: items.length,
      lowStock: count("LOW_STOCK"),
      outOfStock: count("OUT_OF_STOCK"),
      expiring: count("EXPIRING"),
      stockValue: Math.round(items.reduce((sum, i) => sum + i.value * 100, 0)) / 100,
    };
  },

  async createItem(auth: AuthContext, input: CreateInventoryItemInput) {
    const branchId = requireBranch(auth, input.branchId);
    const { today } = await branchContext(branchId);
    await assertSupplier(input.supplierId);
    try {
      const item = await prisma.$transaction(async (tx) => {
        const created = await tx.inventoryItem.create({
          data: {
            branchId,
            name: input.name,
            sku: input.sku,
            category: input.category,
            unit: input.unit,
            quantity: input.quantity,
            minimumQuantity: input.minimumQuantity,
            cost: input.cost,
            supplierId: input.supplierId ?? null,
            expiryDate: input.expiryDate ? parseDateOnly(input.expiryDate) : null,
            storageLocation: input.storageLocation ?? null,
          },
          include: itemInclude,
        });
        // Opening stock goes through the audit trail like any other movement.
        if (input.quantity > 0) {
          await tx.stockTransaction.create({
            data: transactionData(
              created,
              "PURCHASE",
              input.quantity,
              input.quantity,
              auth.userId,
              {
                unitCost: input.cost,
                note: "Opening stock",
              },
            ),
          });
        }
        return created;
      });
      return toItemDto(item, today);
    } catch (error) {
      if (isUniqueViolation(error)) throw skuTaken();
      throw error;
    }
  },

  async updateItem(auth: AuthContext, id: string, input: UpdateInventoryItemInput) {
    const existing = await loadItem(auth, id);
    await assertSupplier(input.supplierId);
    const { today } = await branchContext(existing.branchId);
    try {
      const item = await prisma.inventoryItem.update({
        where: { id },
        data: {
          ...input,
          expiryDate:
            input.expiryDate === undefined
              ? undefined
              : input.expiryDate
                ? parseDateOnly(input.expiryDate)
                : null,
        },
        include: itemInclude,
      });
      return toItemDto(item, today);
    } catch (error) {
      if (isUniqueViolation(error)) throw skuTaken();
      throw error;
    }
  },

  /** Archived, not erased: the movement history keeps pointing at it. */
  async deleteItem(auth: AuthContext, id: string) {
    await loadItem(auth, id);
    await prisma.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  // ── Movements ────────────────────────────────────────────────────
  /**
   * Records one stock movement. The item is locked for the duration, so two people using the same
   * ingredient at once can't both read the old quantity and drive it negative.
   */
  async move(auth: AuthContext, id: string, input: StockMovementInput) {
    const item = await loadItem(auth, id);
    const { today } = await branchContext(item.branchId);

    if (input.type === "TRANSFER") {
      assertBranchAccess(auth, input.toBranchId);
      if (input.toBranchId === item.branchId) {
        throw AppError.validation("Choose a different branch to transfer to.");
      }
      await branchContext(input.toBranchId);
      // The same SKU in the other branch is the destination; create it empty if it's new there.
      const destination =
        (await prisma.inventoryItem.findFirst({
          where: { branchId: input.toBranchId, sku: item.sku, deletedAt: null },
        })) ??
        (await prisma.inventoryItem.create({
          data: {
            branchId: input.toBranchId,
            name: item.name,
            sku: item.sku,
            category: item.category,
            unit: item.unit,
            cost: item.cost,
            minimumQuantity: item.minimumQuantity,
            supplierId: item.supplierId,
            storageLocation: null,
          },
        }));

      await withResourceLocks([item.id, destination.id], async (tx) => {
        const [from, to] = await Promise.all([
          tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }),
          tx.inventoryItem.findUniqueOrThrow({ where: { id: destination.id } }),
        ]);
        const fromAfter = round3(Number(from.quantity) - input.quantity);
        if (fromAfter < 0) {
          throw AppError.conflict(
            "INSUFFICIENT_STOCK",
            `Only ${Number(from.quantity)} ${from.unit} on hand.`,
          );
        }
        const toAfter = round3(Number(to.quantity) + input.quantity);
        const out = await tx.stockTransaction.create({
          data: transactionData(from, "TRANSFER", -input.quantity, fromAfter, auth.userId, {
            note: input.note ?? "Transfer out",
            reference: input.reference,
          }),
        });
        const inbound = await tx.stockTransaction.create({
          data: transactionData(to, "TRANSFER", input.quantity, toAfter, auth.userId, {
            note: input.note ?? "Transfer in",
            reference: input.reference,
            counterpartId: out.id,
          }),
        });
        await tx.stockTransaction.update({
          where: { id: out.id },
          data: { counterpartId: inbound.id },
        });
        await tx.inventoryItem.update({ where: { id: from.id }, data: { quantity: fromAfter } });
        await tx.inventoryItem.update({ where: { id: to.id }, data: { quantity: toAfter } });
      });
    } else {
      await withResourceLocks([item.id], async (tx) => {
        const current = await tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
        const onHand = Number(current.quantity);
        const change =
          input.type === "ADJUSTMENT"
            ? round3(input.countedQuantity - onHand)
            : stockDelta(input.type, input.quantity);
        const after = round3(onHand + change);
        if (after < 0) {
          throw AppError.conflict("INSUFFICIENT_STOCK", `Only ${onHand} ${current.unit} on hand.`);
        }
        await tx.stockTransaction.create({
          data: transactionData(current, input.type, change, after, auth.userId, {
            unitCost: input.type === "PURCHASE" ? input.unitCost : null,
            reference: input.reference,
            note: input.note,
          }),
        });
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            quantity: after,
            // The latest purchase price becomes the item's current cost.
            ...(input.type === "PURCHASE" &&
              input.unitCost !== undefined && { cost: input.unitCost }),
          },
        });
      });
    }

    const updated = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id },
      include: itemInclude,
    });
    const dto = toItemDto(updated, today);
    const was = toItemDto(item, today).status;
    // Tell managers when stock newly runs low or out (not on every movement while it stays low).
    if (
      (dto.status === "OUT_OF_STOCK" && was !== "OUT_OF_STOCK") ||
      (dto.status === "LOW_STOCK" && was === "IN_STOCK")
    ) {
      void events.lowStock(
        {
          branchId: dto.branchId,
          name: dto.name,
          quantity: dto.quantity,
          unit: dto.unit,
          outOfStock: dto.status === "OUT_OF_STOCK",
        },
        auth.userId,
      );
    }
    if (input.type === "WASTE" || input.type === "ADJUSTMENT") {
      void audit(auth, {
        action: input.type === "WASTE" ? "stock.waste" : "stock.adjusted",
        entity: "stock",
        entityId: id,
        branchId: item.branchId,
        previousValue: { item: item.name, quantity: Number(item.quantity) },
        newValue: { quantity: dto.quantity, note: input.note ?? null },
      });
    }
    return dto;
  },

  async transactions(
    auth: AuthContext,
    query: {
      branchId?: string;
      itemId?: string;
      type?: StockTransactionType;
      from?: string;
      to?: string;
    },
  ): Promise<StockTransactionDto[]> {
    const branchId = requireBranch(auth, query.branchId);
    const { branch, today } = await branchContext(branchId);
    const from = localToUtc(query.from ?? query.to ?? today, "00:00", branch.timezone);
    const toDay = localToUtc(query.to ?? today, "00:00", branch.timezone);
    const rows = await prisma.stockTransaction.findMany({
      where: {
        branchId,
        ...(query.itemId && { itemId: query.itemId }),
        ...(query.type && { type: query.type }),
        createdAt: {
          // With no dates the history is the most recent activity, not just today.
          ...(query.from || query.to
            ? { gte: from, lt: new Date(toDay.getTime() + 24 * 3_600_000) }
            : {}),
        },
      },
      include: {
        item: { select: { name: true, sku: true, unit: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return rows.map((t) => ({
      id: t.id,
      itemId: t.itemId,
      itemName: t.item.name,
      sku: t.item.sku,
      unit: t.item.unit,
      type: t.type,
      quantityChange: Number(t.quantityChange),
      quantityAfter: Number(t.quantityAfter),
      unitCost: num(t.unitCost),
      reference: t.reference,
      note: t.note,
      userName: t.user ? `${t.user.firstName} ${t.user.lastName}` : null,
      createdAt: t.createdAt.toISOString(),
    }));
  },
};
