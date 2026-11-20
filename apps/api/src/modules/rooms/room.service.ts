import {
  ACTIVE_ROOM_BOOKING_STATUSES,
  SocketEvents,
  type CreateExtraInput,
  type CreateRoomInput,
  type CreateRoomTypeInput,
  type RoomDto,
  type RoomsOverviewDto,
  type RoomStatus,
  type UpdateRoomInput,
  type UpdateRoomTypeInput,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

import { prisma } from "../../config/database";
import { events } from "../notifications/notify.events";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import { parseDateOnly } from "../../utils/dates";
import { isUniqueViolation } from "../../utils/prisma";
import { slugify } from "../../utils/slug";
import { toExtraDto, toRoomTypeDto } from "./room.mapper";

const ACTIVE = [...ACTIVE_ROOM_BOOKING_STATUSES];

async function loadBranch(branchId: string) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
  if (!branch) throw AppError.notFound("Branch not found.");
  return branch;
}

export const todayIn = (timezone: string) => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");

async function uniqueTypeSlug(branchId: string, name: string): Promise<string> {
  const base = slugify(name);
  const taken = await prisma.roomType.findMany({
    where: { branchId, deletedAt: null, slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Bookings that still need a room: assigned, active, and not yet over. */
async function hasActiveFutureBookings(where: Prisma.RoomBookingWhereInput, today: string) {
  return (
    (await prisma.roomBooking.count({
      where: {
        ...where,
        bookingStatus: { in: ACTIVE },
        checkOutDate: { gt: parseDateOnly(today) },
      },
    })) > 0
  );
}

export const roomService = {
  // ── Room types ───────────────────────────────────────────────────
  async publicRoomTypes(branchId: string) {
    await loadBranch(branchId);
    const types = await prisma.roomType.findMany({
      where: { branchId, deletedAt: null, status: "ACTIVE", rooms: { some: { deletedAt: null } } },
      orderBy: { basePrice: "asc" },
    });
    return types.map((t) => toRoomTypeDto(t));
  },

  async publicRoomType(branchId: string, slug: string) {
    const type = await prisma.roomType.findFirst({
      where: { branchId, slug, deletedAt: null, status: "ACTIVE" },
    });
    if (!type) throw AppError.notFound("Room type not found.");
    return toRoomTypeDto(type);
  },

  async adminRoomTypes(auth: AuthContext, branchId?: string) {
    const scoped = requireBranch(auth, branchId);
    const types = await prisma.roomType.findMany({
      where: { branchId: scoped, deletedAt: null },
      include: { _count: { select: { rooms: { where: { deletedAt: null } } } } },
      orderBy: { name: "asc" },
    });
    return types.map((t) => toRoomTypeDto(t, t._count.rooms));
  },

  async createRoomType(auth: AuthContext, input: CreateRoomTypeInput) {
    assertBranchAccess(auth, input.branchId);
    await loadBranch(input.branchId);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const type = await prisma.roomType.create({
          data: { ...input, slug: await uniqueTypeSlug(input.branchId, input.name) },
        });
        return toRoomTypeDto(type, 0);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw AppError.conflict("SLUG_CONFLICT", "Could not allocate a unique URL for this room type.");
  },

  async updateRoomType(auth: AuthContext, id: string, input: UpdateRoomTypeInput) {
    const existing = await prisma.roomType.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Room type not found.");
    assertBranchAccess(auth, existing.branchId);
    const type = await prisma.roomType.update({ where: { id }, data: input });
    return toRoomTypeDto(type);
  },

  async deleteRoomType(auth: AuthContext, id: string) {
    const existing = await prisma.roomType.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Room type not found.");
    assertBranchAccess(auth, existing.branchId);
    const rooms = await prisma.room.count({ where: { roomTypeId: id, deletedAt: null } });
    if (rooms > 0) {
      throw AppError.conflict("ROOM_TYPE_IN_USE", "Remove or move this type's rooms first.");
    }
    await prisma.roomType.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  // ── Physical rooms ───────────────────────────────────────────────
  async listRooms(auth: AuthContext, branchId?: string): Promise<RoomDto[]> {
    const scoped = requireBranch(auth, branchId);
    const branch = await loadBranch(scoped);
    const today = parseDateOnly(todayIn(branch.timezone));
    const [rooms, inHouse, arriving] = await Promise.all([
      prisma.room.findMany({
        where: { branchId: scoped, deletedAt: null },
        include: { roomType: { select: { name: true } } },
        orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
      }),
      prisma.roomBooking.findMany({
        where: { branchId: scoped, bookingStatus: "CHECKED_IN", roomId: { not: null } },
        select: { roomId: true, guestName: true },
      }),
      prisma.roomBooking.findMany({
        where: {
          branchId: scoped,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          checkInDate: today,
          roomId: { not: null },
        },
        select: { roomId: true },
      }),
    ]);
    const guestByRoom = new Map(inHouse.map((b) => [b.roomId, b.guestName]));
    const arrivingRooms = new Set(arriving.map((b) => b.roomId));
    return rooms
      .sort(
        (a, b) =>
          a.floor - b.floor ||
          a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
      )
      .map((r) => ({
        id: r.id,
        branchId: r.branchId,
        roomTypeId: r.roomTypeId,
        roomTypeName: r.roomType.name,
        roomNumber: r.roomNumber,
        floor: r.floor,
        status: r.status,
        housekeepingStatus: r.housekeepingStatus,
        notes: r.notes,
        reservedToday: r.status === "AVAILABLE" && arrivingRooms.has(r.id),
        currentGuest: guestByRoom.get(r.id) ?? null,
      }));
  },

  async createRoom(auth: AuthContext, input: CreateRoomInput) {
    assertBranchAccess(auth, input.branchId);
    const type = await prisma.roomType.findFirst({
      where: { id: input.roomTypeId, branchId: input.branchId, deletedAt: null },
    });
    if (!type) throw AppError.validation("The room type does not belong to this branch.");
    try {
      const room = await prisma.room.create({ data: input });
      emitToBranch(room.branchId, SocketEvents.ROOM_UPDATED, { id: room.id });
      return { id: room.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict("ROOM_NUMBER_TAKEN", "A room with this number already exists.");
      }
      throw error;
    }
  },

  async updateRoom(auth: AuthContext, id: string, input: UpdateRoomInput) {
    const room = await loadRoom(auth, id);
    if (input.roomTypeId && input.roomTypeId !== room.roomTypeId) {
      const type = await prisma.roomType.findFirst({
        where: { id: input.roomTypeId, branchId: room.branchId, deletedAt: null },
      });
      if (!type) throw AppError.validation("The room type does not belong to this branch.");
      const branch = await loadBranch(room.branchId);
      if (await hasActiveFutureBookings({ roomId: id }, todayIn(branch.timezone))) {
        throw AppError.conflict(
          "ROOM_HAS_BOOKINGS",
          "Reassign this room's upcoming bookings before changing its type.",
        );
      }
    }
    try {
      await prisma.room.update({ where: { id }, data: input });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict("ROOM_NUMBER_TAKEN", "A room with this number already exists.");
      }
      throw error;
    }
    emitToBranch(room.branchId, SocketEvents.ROOM_UPDATED, { id });
  },

  async setStatus(auth: AuthContext, id: string, status: RoomStatus) {
    const room = await loadRoom(auth, id);
    if (room.status === "OCCUPIED") {
      throw AppError.conflict(
        "ROOM_OCCUPIED",
        "A guest is staying in this room. Check them out first.",
      );
    }
    if (status === "MAINTENANCE" || status === "OUT_OF_SERVICE") {
      const branch = await loadBranch(room.branchId);
      if (await hasActiveFutureBookings({ roomId: id }, todayIn(branch.timezone))) {
        throw AppError.conflict(
          "ROOM_HAS_BOOKINGS",
          "This room has upcoming bookings. Move them to another room first.",
        );
      }
    }
    await prisma.room.update({ where: { id }, data: { status } });
    if (status === "MAINTENANCE" || status === "OUT_OF_SERVICE") {
      void events.roomMaintenance(
        { branchId: room.branchId, roomNumber: room.roomNumber, status },
        auth.userId,
      );
    }
    emitToBranch(room.branchId, SocketEvents.ROOM_UPDATED, { id });
  },

  async deleteRoom(auth: AuthContext, id: string) {
    const room = await loadRoom(auth, id);
    const branch = await loadBranch(room.branchId);
    if (
      room.status === "OCCUPIED" ||
      (await hasActiveFutureBookings({ roomId: id }, todayIn(branch.timezone)))
    ) {
      throw AppError.conflict("ROOM_HAS_BOOKINGS", "This room has current or upcoming bookings.");
    }
    await prisma.room.update({ where: { id }, data: { deletedAt: new Date() } });
    emitToBranch(room.branchId, SocketEvents.ROOM_UPDATED, { id });
  },

  /** Today's picture: inventory by status, occupancy, arrivals and departures. */
  async overview(auth: AuthContext, branchId?: string): Promise<RoomsOverviewDto> {
    const scoped = requireBranch(auth, branchId);
    const branch = await loadBranch(scoped);
    const date = todayIn(branch.timezone);
    const today = parseDateOnly(date);

    const [rooms, inHouse, arrivals, departures] = await Promise.all([
      prisma.room.findMany({
        where: { branchId: scoped, deletedAt: null },
        select: { status: true, housekeepingStatus: true },
      }),
      prisma.roomBooking.count({ where: { branchId: scoped, bookingStatus: "CHECKED_IN" } }),
      prisma.roomBooking.count({
        where: {
          branchId: scoped,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          checkInDate: today,
        },
      }),
      prisma.roomBooking.count({
        where: { branchId: scoped, bookingStatus: "CHECKED_IN", checkOutDate: today },
      }),
    ]);
    const byStatus: Record<RoomStatus, number> = {
      AVAILABLE: 0,
      RESERVED: 0,
      OCCUPIED: 0,
      CLEANING: 0,
      MAINTENANCE: 0,
      OUT_OF_SERVICE: 0,
    };
    for (const r of rooms) byStatus[r.status] += 1;
    // Rooms that are down for maintenance are not sellable, so they do not count against occupancy.
    const sellable = rooms.length - byStatus.MAINTENANCE - byStatus.OUT_OF_SERVICE;
    return {
      date,
      totalRooms: rooms.length,
      byStatus,
      occupied: byStatus.OCCUPIED,
      occupancyPercent: sellable > 0 ? Math.round((byStatus.OCCUPIED / sellable) * 100) : 0,
      arrivalsToday: arrivals,
      departuresToday: departures,
      inHouse,
      dirtyRooms: rooms.filter((r) => r.housekeepingStatus === "DIRTY").length,
    };
  },

  // ── Extras ───────────────────────────────────────────────────────
  async publicExtras(branchId: string) {
    const extras = await prisma.roomExtra.findMany({
      where: { branchId, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
    });
    return extras.map(toExtraDto);
  },

  async adminExtras(auth: AuthContext, branchId?: string) {
    const extras = await prisma.roomExtra.findMany({
      where: { branchId: requireBranch(auth, branchId), deletedAt: null },
      orderBy: { name: "asc" },
    });
    return extras.map(toExtraDto);
  },

  async createExtra(auth: AuthContext, input: CreateExtraInput) {
    assertBranchAccess(auth, input.branchId);
    await loadBranch(input.branchId);
    return toExtraDto(await prisma.roomExtra.create({ data: input }));
  },

  async updateExtra(auth: AuthContext, id: string, input: Partial<CreateExtraInput>) {
    const existing = await prisma.roomExtra.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Extra not found.");
    assertBranchAccess(auth, existing.branchId);
    return toExtraDto(await prisma.roomExtra.update({ where: { id }, data: input }));
  },

  async deleteExtra(auth: AuthContext, id: string) {
    const existing = await prisma.roomExtra.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Extra not found.");
    assertBranchAccess(auth, existing.branchId);
    // Past bookings keep their own snapshot of the extra, so a soft delete is safe.
    await prisma.roomExtra.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};

export async function loadRoom(auth: AuthContext, id: string) {
  const room = await prisma.room.findFirst({ where: { id, deletedAt: null } });
  if (!room) throw AppError.notFound("Room not found.");
  assertBranchAccess(auth, room.branchId);
  return room;
}
