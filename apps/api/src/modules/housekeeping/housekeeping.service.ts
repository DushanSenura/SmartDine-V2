import {
  roomStatusAfterHousekeeping,
  SocketEvents,
  type HousekeepingStatus,
  type HousekeepingTaskDto,
  type HousekeepingTaskStatus,
} from "@smartdine/shared";
import type { HousekeepingTask, Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, scopeBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import { loadRoom } from "../rooms/room.service";

type TaskWithRefs = HousekeepingTask & {
  room: { roomNumber: string };
  assignedTo: { firstName: string; lastName: string } | null;
};

const taskInclude = {
  room: { select: { roomNumber: true } },
  assignedTo: { select: { firstName: true, lastName: true } },
} satisfies Prisma.HousekeepingTaskInclude;

const toTaskDto = (t: TaskWithRefs): HousekeepingTaskDto => ({
  id: t.id,
  roomId: t.roomId,
  roomNumber: t.room.roomNumber,
  type: t.type,
  status: t.status,
  assignedToId: t.assignedToId,
  assignedToName: t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : null,
  notes: t.notes,
  createdAt: t.createdAt.toISOString(),
  completedAt: t.completedAt?.toISOString() ?? null,
});

/**
 * Applies a housekeeping status to a room, moving the room in or out of service as appropriate,
 * and closes the room's open cleaning tasks once it is clean.
 */
async function applyHousekeeping(
  auth: AuthContext,
  roomId: string,
  next: HousekeepingStatus,
  notes?: string | null,
) {
  const room = await loadRoom(auth, roomId);
  if (next === "MAINTENANCE" && room.status === "OCCUPIED") {
    throw AppError.conflict("ROOM_OCCUPIED", "A guest is staying in this room.");
  }
  const status = roomStatusAfterHousekeeping(room.status, next);

  await prisma.$transaction(async (tx) => {
    await tx.room.update({
      where: { id: roomId },
      data: { housekeepingStatus: next, status, ...(notes !== undefined && { notes }) },
    });
    if (next === "CLEAN" || next === "INSPECTION") {
      await tx.housekeepingTask.updateMany({
        where: { roomId, status: { in: ["OPEN", "IN_PROGRESS"] } },
        data: { status: "DONE", completedAt: new Date() },
      });
    }
  });
  emitToBranch(room.branchId, SocketEvents.ROOM_UPDATED, { id: roomId });
}

export const housekeepingService = {
  setRoomStatus: applyHousekeeping,

  async listTasks(
    auth: AuthContext,
    query: { branchId?: string; status?: HousekeepingTaskStatus },
  ) {
    const branchId = scopeBranch(auth, query.branchId);
    const tasks = await prisma.housekeepingTask.findMany({
      where: {
        ...(branchId && { branchId }),
        // Default to work that still needs doing.
        status: query.status ?? { in: ["OPEN", "IN_PROGRESS"] },
      },
      include: taskInclude,
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return tasks.map(toTaskDto);
  },

  async updateTask(
    auth: AuthContext,
    id: string,
    input: { status?: HousekeepingTaskStatus; assignedToId?: string | null; notes?: string | null },
  ) {
    const task = await prisma.housekeepingTask.findUnique({ where: { id } });
    if (!task) throw AppError.notFound("Task not found.");
    assertBranchAccess(auth, task.branchId);

    if (input.assignedToId) {
      const member = await prisma.user.findFirst({
        where: {
          id: input.assignedToId,
          branchId: task.branchId,
          deletedAt: null,
          status: "ACTIVE",
        },
      });
      if (!member) throw AppError.validation("That staff member does not work at this branch.");
    }
    if (input.status === "DONE") {
      // Finishing the job means the room is clean.
      await applyHousekeeping(auth, task.roomId, "CLEAN");
    }
    const updated = await prisma.housekeepingTask.update({
      where: { id },
      data: {
        assignedToId: input.assignedToId,
        notes: input.notes,
        ...(input.status && input.status !== "DONE" && { status: input.status }),
      },
      include: taskInclude,
    });
    // Reload for the DONE case, where applyHousekeeping already closed the task.
    const fresh = await prisma.housekeepingTask.findUniqueOrThrow({
      where: { id },
      include: taskInclude,
    });
    return toTaskDto(input.status === "DONE" ? fresh : updated);
  },
};
