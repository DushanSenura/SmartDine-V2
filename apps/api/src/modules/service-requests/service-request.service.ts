import {
  SERVICE_REQUEST_TYPE_LABELS,
  SocketEvents,
  type CreateServiceRequestInput,
  type ServiceRequestDto,
  type ServiceRequestListQuery,
  type ServiceRequestType,
} from "@smartdine/shared";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import { notify } from "../notifications/notification.service";

const include = { table: { select: { tableNumber: true } } } as const;

const toDto = (r: {
  id: string;
  branchId: string;
  tableId: string;
  type: string;
  note: string | null;
  status: "OPEN" | "RESOLVED";
  createdAt: Date;
  resolvedAt: Date | null;
  table: { tableNumber: string };
}): ServiceRequestDto => ({
  id: r.id,
  branchId: r.branchId,
  tableId: r.tableId,
  tableNumber: r.table.tableNumber,
  type: r.type as ServiceRequestType,
  note: r.note,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
});

const changed = (branchId: string) =>
  emitToBranch(branchId, SocketEvents.SERVICE_REQUEST_CHANGED, { branchId });

export const serviceRequestService = {
  async list(auth: AuthContext, query: ServiceRequestListQuery) {
    const branchId = requireBranch(auth, query.branchId);
    const rows = await prisma.serviceRequest.findMany({
      where: { branchId, status: query.status },
      include,
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map(toDto);
  },

  /** Logs what a guest asked for and tells the table's waiter (or, if none, the floor staff). */
  async create(auth: AuthContext, input: CreateServiceRequestInput) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: input.tableId, deletedAt: null },
      select: { id: true, branchId: true, tableNumber: true, assignedWaiterId: true },
    });
    if (!table) throw AppError.notFound("Table not found.");
    assertBranchAccess(auth, table.branchId);
    if (input.branchId && input.branchId !== table.branchId) {
      throw AppError.validation("That table belongs to a different branch.");
    }

    const duplicate = await prisma.serviceRequest.findFirst({
      where: { tableId: table.id, type: input.type, status: "OPEN" },
      include,
    });
    if (duplicate) return toDto(duplicate); // asking twice doesn't page the waiter twice

    const created = await prisma.serviceRequest.create({
      data: {
        branchId: table.branchId,
        tableId: table.id,
        type: input.type,
        note: input.note ?? null,
        createdById: auth.userId,
      },
      include,
    });
    changed(table.branchId);
    void notify({
      type: "SERVICE_REQUESTED",
      title: `Table ${table.tableNumber}: ${SERVICE_REQUEST_TYPE_LABELS[input.type]}`,
      body: input.note ?? null,
      link: "/app/waiter",
      branchId: table.branchId,
      userIds: [table.assignedWaiterId],
      roles: table.assignedWaiterId ? [] : ["WAITER", "MANAGER"],
      excludeUserId: auth.userId,
    });
    return toDto(created);
  },

  async resolve(auth: AuthContext, id: string) {
    const existing = await prisma.serviceRequest.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Request not found.");
    assertBranchAccess(auth, existing.branchId);
    // Resolving twice is harmless: the second caller just gets the settled row back.
    const row = await prisma.serviceRequest.update({
      where: { id },
      data:
        existing.status === "OPEN"
          ? { status: "RESOLVED", resolvedAt: new Date(), resolvedById: auth.userId }
          : {},
      include,
    });
    if (existing.status === "OPEN") changed(existing.branchId);
    return toDto(row);
  },
};
