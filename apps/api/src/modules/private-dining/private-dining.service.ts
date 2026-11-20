import type {
  CreatePrivateRoomInput,
  OpeningHours,
  PrivateRoomDto,
  UpdatePrivateRoomInput,
} from "@smartdine/shared";
import type { Prisma, PrivateDiningRoom } from "@prisma/client";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { jsonOrNull } from "../../utils/prisma";

const toDto = (room: PrivateDiningRoom): PrivateRoomDto => ({
  id: room.id,
  branchId: room.branchId,
  name: room.name,
  description: room.description,
  capacity: room.capacity,
  minimumGuests: room.minimumGuests,
  maximumGuests: room.maximumGuests,
  images: room.images,
  amenities: room.amenities,
  minimumSpend: Number(room.minimumSpend),
  hourlyRate: Number(room.hourlyRate),
  deposit: Number(room.deposit),
  openingTimes: room.openingTimes as OpeningHours | null,
  specialRules: room.specialRules,
  isActive: room.isActive,
});

async function load(auth: AuthContext, id: string) {
  const room = await prisma.privateDiningRoom.findFirst({ where: { id, deletedAt: null } });
  if (!room) throw AppError.notFound("Private dining room not found.");
  assertBranchAccess(auth, room.branchId);
  return room;
}

function assertGuestLimits(min: number, max: number, capacity: number) {
  if (min > max) throw AppError.validation("Minimum guests cannot exceed maximum guests.");
  if (max > capacity) throw AppError.validation("Maximum guests cannot exceed capacity.");
}

export const privateDiningService = {
  async list(auth: AuthContext, branchId?: string) {
    const rooms = await prisma.privateDiningRoom.findMany({
      where: { branchId: requireBranch(auth, branchId), deletedAt: null },
      orderBy: { name: "asc" },
    });
    return rooms.map(toDto);
  },

  async create(auth: AuthContext, input: CreatePrivateRoomInput) {
    assertBranchAccess(auth, input.branchId);
    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, deletedAt: null },
    });
    if (!branch) throw AppError.validation("The selected branch does not exist.");
    const { openingTimes, ...rest } = input;
    const room = await prisma.privateDiningRoom.create({
      data: {
        ...rest,
        ...(openingTimes !== undefined && { openingTimes: jsonOrNull(openingTimes) }),
      } as Prisma.PrivateDiningRoomUncheckedCreateInput,
    });
    return toDto(room);
  },

  async update(auth: AuthContext, id: string, input: UpdatePrivateRoomInput) {
    const existing = await load(auth, id);
    assertGuestLimits(
      input.minimumGuests ?? existing.minimumGuests,
      input.maximumGuests ?? existing.maximumGuests,
      input.capacity ?? existing.capacity,
    );
    const { openingTimes, ...rest } = input;
    const room = await prisma.privateDiningRoom.update({
      where: { id },
      data: {
        ...rest,
        ...(openingTimes !== undefined && { openingTimes: jsonOrNull(openingTimes) }),
      } as Prisma.PrivateDiningRoomUncheckedUpdateInput,
    });
    return toDto(room);
  },

  async remove(auth: AuthContext, id: string) {
    await load(auth, id);
    await prisma.privateDiningRoom.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};
