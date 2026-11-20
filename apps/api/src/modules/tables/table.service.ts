import {
  SocketEvents,
  type CreateDiningAreaInput,
  type CreateTableInput,
  type SaveLayoutInput,
  type TableStatus,
  type UpdateDiningAreaInput,
  type UpdateTableInput,
} from "@smartdine/shared";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import { isUniqueViolation } from "../../utils/prisma";
import { tableInclude, toAreaDto, toTableDto } from "./table.mapper";

const TABLE_NUMBER_TAKEN = () =>
  AppError.conflict("TABLE_NUMBER_TAKEN", "A table with this number already exists in the branch.");

async function loadTable(auth: AuthContext, id: string) {
  const table = await prisma.restaurantTable.findFirst({
    where: { id, deletedAt: null },
    include: tableInclude,
  });
  if (!table) throw AppError.notFound("Table not found.");
  assertBranchAccess(auth, table.branchId);
  return table;
}

async function loadArea(auth: AuthContext, id: string) {
  const area = await prisma.diningArea.findFirst({ where: { id, deletedAt: null } });
  if (!area) throw AppError.notFound("Dining area not found.");
  assertBranchAccess(auth, area.branchId);
  return area;
}

async function assertWaiter(waiterId: string, branchId: string) {
  const waiter = await prisma.user.findFirst({
    where: { id: waiterId, branchId, deletedAt: null, status: "ACTIVE", role: { name: "WAITER" } },
  });
  if (!waiter) throw AppError.validation("The selected waiter does not work at this branch.");
}

export const tableService = {
  // ── Dining areas ───────────────────────────────────────────────
  async listAreas(auth: AuthContext, branchId?: string) {
    const scoped = requireBranch(auth, branchId);
    const areas = await prisma.diningArea.findMany({
      where: { branchId: scoped, deletedAt: null },
      orderBy: [{ floor: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return areas.map(toAreaDto);
  },

  async createArea(auth: AuthContext, input: CreateDiningAreaInput) {
    assertBranchAccess(auth, input.branchId);
    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, deletedAt: null },
    });
    if (!branch) throw AppError.validation("The selected branch does not exist.");
    const area = await prisma.diningArea.create({ data: input });
    emitToBranch(area.branchId, SocketEvents.FLOOR_LAYOUT_CHANGED, { branchId: area.branchId });
    return toAreaDto(area);
  },

  async updateArea(auth: AuthContext, id: string, input: UpdateDiningAreaInput) {
    await loadArea(auth, id);
    const area = await prisma.diningArea.update({ where: { id }, data: input });
    emitToBranch(area.branchId, SocketEvents.FLOOR_LAYOUT_CHANGED, { branchId: area.branchId });
    return toAreaDto(area);
  },

  async deleteArea(auth: AuthContext, id: string) {
    const area = await loadArea(auth, id);
    const tables = await prisma.restaurantTable.count({
      where: { diningAreaId: id, deletedAt: null },
    });
    if (tables > 0) {
      throw AppError.conflict("AREA_NOT_EMPTY", "Move or remove the tables in this area first.");
    }
    await prisma.diningArea.update({ where: { id }, data: { deletedAt: new Date() } });
    emitToBranch(area.branchId, SocketEvents.FLOOR_LAYOUT_CHANGED, { branchId: area.branchId });
  },

  // ── Tables ─────────────────────────────────────────────────────
  async listTables(auth: AuthContext, branchId?: string) {
    const scoped = requireBranch(auth, branchId);
    const tables = await prisma.restaurantTable.findMany({
      where: { branchId: scoped, deletedAt: null },
      include: tableInclude,
      orderBy: { tableNumber: "asc" },
    });
    return tables.map(toTableDto);
  },

  async createTable(auth: AuthContext, input: CreateTableInput) {
    assertBranchAccess(auth, input.branchId);
    const area = await prisma.diningArea.findFirst({
      where: { id: input.diningAreaId, branchId: input.branchId, deletedAt: null },
    });
    if (!area) throw AppError.validation("The dining area does not belong to this branch.");
    if (input.assignedWaiterId) await assertWaiter(input.assignedWaiterId, input.branchId);
    try {
      const table = await prisma.restaurantTable.create({ data: input, include: tableInclude });
      const dto = toTableDto(table);
      emitToBranch(table.branchId, SocketEvents.TABLE_CREATED, dto);
      return dto;
    } catch (error) {
      if (isUniqueViolation(error)) throw TABLE_NUMBER_TAKEN();
      throw error;
    }
  },

  async updateTable(auth: AuthContext, id: string, input: UpdateTableInput) {
    const existing = await loadTable(auth, id);
    if (input.diningAreaId && input.diningAreaId !== existing.diningAreaId) {
      const area = await prisma.diningArea.findFirst({
        where: { id: input.diningAreaId, branchId: existing.branchId, deletedAt: null },
      });
      if (!area) throw AppError.validation("The dining area does not belong to this branch.");
    }
    if (input.assignedWaiterId) await assertWaiter(input.assignedWaiterId, existing.branchId);
    try {
      const table = await prisma.restaurantTable.update({
        where: { id },
        data: input,
        include: tableInclude,
      });
      const dto = toTableDto(table);
      emitToBranch(table.branchId, SocketEvents.TABLE_UPDATED, dto);
      return dto;
    } catch (error) {
      if (isUniqueViolation(error)) throw TABLE_NUMBER_TAKEN();
      throw error;
    }
  },

  /** Operational status change (waiters, managers). Pushed live to everyone in the branch. */
  async setStatus(auth: AuthContext, id: string, status: TableStatus) {
    await loadTable(auth, id);
    const table = await prisma.restaurantTable.update({
      where: { id },
      data: { status },
      include: tableInclude,
    });
    const dto = toTableDto(table);
    emitToBranch(table.branchId, SocketEvents.TABLE_UPDATED, dto);
    return dto;
  },

  async deleteTable(auth: AuthContext, id: string) {
    const table = await loadTable(auth, id);
    await prisma.restaurantTable.update({ where: { id }, data: { deletedAt: new Date() } });
    emitToBranch(table.branchId, SocketEvents.TABLE_DELETED, { id, branchId: table.branchId });
  },

  /** Persists positions / sizes (and optionally area moves) after drag & resize in the editor. */
  async saveLayout(auth: AuthContext, input: SaveLayoutInput) {
    const ids = input.tables.map((t) => t.id);
    const found = await prisma.restaurantTable.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, branchId: true },
    });
    if (found.length !== new Set(ids).size)
      throw AppError.notFound("One or more tables were not found.");
    const branchIds = new Set(found.map((t) => t.branchId));
    if (branchIds.size !== 1) throw AppError.validation("Update tables of one branch at a time.");
    const branchId = [...branchIds][0]!;
    assertBranchAccess(auth, branchId);

    const areaIds = [
      ...new Set(input.tables.flatMap((t) => (t.diningAreaId ? [t.diningAreaId] : []))),
    ];
    if (areaIds.length) {
      const valid = await prisma.diningArea.count({
        where: { id: { in: areaIds }, branchId, deletedAt: null },
      });
      if (valid !== areaIds.length)
        throw AppError.validation("A dining area does not belong to this branch.");
    }

    await prisma.$transaction(
      input.tables.map(({ id, ...data }) => prisma.restaurantTable.update({ where: { id }, data })),
    );
    emitToBranch(branchId, SocketEvents.FLOOR_LAYOUT_CHANGED, { branchId });
    return this.listTables(auth, branchId);
  },

  async assignWaiter(auth: AuthContext, tableIds: string[], waiterId: string | null) {
    const tables = await prisma.restaurantTable.findMany({
      where: { id: { in: tableIds }, deletedAt: null },
      select: { id: true, branchId: true },
    });
    if (tables.length !== new Set(tableIds).size)
      throw AppError.notFound("One or more tables were not found.");
    const branchIds = new Set(tables.map((t) => t.branchId));
    if (branchIds.size !== 1) throw AppError.validation("Assign tables of one branch at a time.");
    const branchId = [...branchIds][0]!;
    assertBranchAccess(auth, branchId);
    if (waiterId) await assertWaiter(waiterId, branchId);

    await prisma.restaurantTable.updateMany({
      where: { id: { in: tableIds } },
      data: { assignedWaiterId: waiterId },
    });
    emitToBranch(branchId, SocketEvents.FLOOR_LAYOUT_CHANGED, { branchId });
    return this.listTables(auth, branchId);
  },
};
