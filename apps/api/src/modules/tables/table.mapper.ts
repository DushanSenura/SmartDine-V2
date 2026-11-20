import type { DiningAreaDto, TableDto } from "@smartdine/shared";
import type { DiningArea, Prisma } from "@prisma/client";

export const tableInclude = {
  assignedWaiter: { select: { firstName: true, lastName: true } },
} satisfies Prisma.RestaurantTableInclude;

export type TableRecord = Prisma.RestaurantTableGetPayload<{ include: typeof tableInclude }>;

export const toTableDto = (t: TableRecord): TableDto => ({
  id: t.id,
  branchId: t.branchId,
  diningAreaId: t.diningAreaId,
  tableNumber: t.tableNumber,
  name: t.name,
  section: t.section,
  capacity: t.capacity,
  status: t.status,
  shape: t.shape,
  positionX: t.positionX,
  positionY: t.positionY,
  width: t.width,
  height: t.height,
  assignedWaiterId: t.assignedWaiterId,
  assignedWaiterName: t.assignedWaiter
    ? `${t.assignedWaiter.firstName} ${t.assignedWaiter.lastName}`
    : null,
  notes: t.notes,
});

export const toAreaDto = (a: DiningArea): DiningAreaDto => ({
  id: a.id,
  branchId: a.branchId,
  name: a.name,
  floor: a.floor,
  sortOrder: a.sortOrder,
  width: a.width,
  height: a.height,
  isActive: a.isActive,
});
