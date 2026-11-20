import { randomInt } from "node:crypto";

import {
  ACTIVE_ROOM_BOOKING_STATUSES,
  addDaysIso,
  buildQuote,
  extraTotal,
  nightlyRates,
  nightsBetween,
  stayNights,
  ROOM_BOOKING_TRANSITIONS,
  ROOM_RULES,
  SocketEvents,
  type AvailableRoomType,
  type CreateRoomBookingInput,
  type CreateStaffRoomBookingInput,
  type RoomAvailabilityDto,
  type RoomAvailabilityQuery,
  type RoomBookingStatus,
} from "@smartdine/shared";
import type { Branch } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { events } from "../notifications/notify.events";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, scopeBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import { parseDateOnly } from "../../utils/dates";
import {
  backoff,
  isTransientConflict,
  isUniqueViolation,
  withResourceLock,
} from "../../utils/prisma";
import { toRoomTypeDto } from "../rooms/room.mapper";
import { todayIn } from "../rooms/room.service";
import {
  bookingInclude,
  cancellableUntil,
  toBookingDto,
  type BookingRecord,
  type StayRules,
} from "./booking.mapper";

const ACTIVE = [...ACTIVE_ROOM_BOOKING_STATUSES];
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateReference = () =>
  `RM-${Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join("")}`;

const unavailable = () =>
  AppError.conflict(
    "ROOM_UNAVAILABLE",
    "No room of this type is available for those dates. Please choose different dates or another room type.",
  );

const isOverlapViolation = (error: unknown) =>
  /room_booking_no_overlap|exclusion constraint|23P01/i.test(
    error instanceof Error ? error.message : "",
  );

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

async function loadSettings() {
  const s = await prisma.companySettings.findFirst();
  return {
    taxRatePercent: Number(s?.taxRatePercent ?? 0),
    depositPercent: Number(s?.roomDepositPercent ?? 20),
    rules: {
      checkInTime: s?.checkInTime ?? "14:00",
      checkOutTime: s?.checkOutTime ?? "11:00",
      cancellationWindowHours: s?.cancellationWindowHours ?? 24,
    } satisfies StayRules,
  };
}

async function loadBranch(branchId: string) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
  if (!branch) throw AppError.notFound("Branch not found.");
  return branch;
}

/** Validates dates and party size against booking rules. */
function validateStay(
  branch: Branch,
  q: { checkIn: string; checkOut: string; adults: number; children: number },
) {
  const today = todayIn(branch.timezone);
  if (q.checkIn < today) throw AppError.validation("Check-in cannot be in the past.");
  const nights = nightsBetween(q.checkIn, q.checkOut);
  if (nights < 1) throw AppError.validation("Check-out must be after check-in.");
  if (nights > ROOM_RULES.maxNights) {
    throw AppError.validation(`Stays are limited to ${ROOM_RULES.maxNights} nights online.`);
  }
  if (q.checkIn > addDaysIso(today, ROOM_RULES.maxAdvanceDays)) {
    throw AppError.validation(`Bookings open up to ${ROOM_RULES.maxAdvanceDays} days ahead.`);
  }
  if (q.adults + q.children > ROOM_RULES.maxGuestsPerBooking) {
    throw AppError.validation("Too many guests for one booking.");
  }
  return nights;
}

/** Sellable rooms of a branch (optionally one type) that no active booking holds during the stay. */
async function freeRooms(branchId: string, checkIn: string, checkOut: string, roomTypeId?: string) {
  const rooms = await prisma.room.findMany({
    where: {
      branchId,
      deletedAt: null,
      status: { notIn: ["MAINTENANCE", "OUT_OF_SERVICE"] },
      ...(roomTypeId && { roomTypeId }),
    },
  });
  if (!rooms.length) return [];
  const busy = await prisma.roomBooking.findMany({
    where: {
      roomId: { in: rooms.map((r) => r.id) },
      bookingStatus: { in: ACTIVE },
      checkInDate: { lt: parseDateOnly(checkOut) },
      checkOutDate: { gt: parseDateOnly(checkIn) },
    },
    select: { roomId: true },
  });
  const busyIds = new Set(busy.map((b) => b.roomId));
  return rooms
    .filter((r) => !busyIds.has(r.id))
    .sort((a, b) => naturalCompare(a.roomNumber, b.roomNumber));
}

async function finish(id: string, rules: StayRules) {
  const record = await prisma.roomBooking.findUniqueOrThrow({
    where: { id },
    include: bookingInclude,
  });
  return { record, dto: toBookingDto(record, rules) };
}

function publish(record: BookingRecord, rules: StayRules) {
  emitToBranch(record.branchId, SocketEvents.ROOM_BOOKING_CHANGED, toBookingDto(record, rules));
  emitToBranch(record.branchId, SocketEvents.ROOM_UPDATED, { id: record.roomId });
}

export const bookingService = {
  // ── Public availability ──────────────────────────────────────────
  async availability(query: RoomAvailabilityQuery): Promise<RoomAvailabilityDto> {
    const branch = await loadBranch(query.branchId);
    const nights = validateStay(branch, query);
    const guests = query.adults + query.children;
    const { taxRatePercent, depositPercent, rules } = await loadSettings();

    const types = await prisma.roomType.findMany({
      where: {
        branchId: branch.id,
        deletedAt: null,
        status: "ACTIVE",
        maximumGuests: { gte: guests },
      },
      orderBy: { basePrice: "asc" },
    });
    const free = await freeRooms(branch.id, query.checkIn, query.checkOut);
    const freeByType = new Map<string, number>();
    for (const room of free)
      freeByType.set(room.roomTypeId, (freeByType.get(room.roomTypeId) ?? 0) + 1);

    const dates = stayNights(query.checkIn, nights);
    const results: AvailableRoomType[] = types
      .filter((t) => (freeByType.get(t.id) ?? 0) > 0)
      .map((t) => ({
        roomType: toRoomTypeDto(t),
        available: freeByType.get(t.id) ?? 0,
        quote: buildQuote({
          nightly: nightlyRates(
            Number(t.basePrice),
            t.weekendPrice ? Number(t.weekendPrice) : null,
            dates,
          ),
          taxRatePercent,
          depositPercent,
          currency: branch.currency,
        }),
      }));

    return {
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      nights,
      guests,
      checkInTime: rules.checkInTime,
      checkOutTime: rules.checkOutTime,
      results,
    };
  },

  // ── Booking ──────────────────────────────────────────────────────
  /**
   * Prices the stay and books the first free room of the chosen type. The exclusion constraint is
   * the final arbiter: a request that loses a race moves on to the next candidate room.
   */
  async create(
    auth: AuthContext,
    input: CreateRoomBookingInput | CreateStaffRoomBookingInput,
    options: { byStaff: boolean },
  ) {
    const branch = await loadBranch(input.branchId);
    if (branch.status !== "OPEN") {
      throw AppError.conflict(
        "BRANCH_NOT_OPEN",
        "This branch is not accepting bookings right now.",
      );
    }
    const nights = validateStay(branch, input);
    const guests = input.adults + input.children;
    if (input.additionalGuests.length > guests - 1) {
      throw AppError.validation("More additional guests were listed than the party size allows.");
    }

    const type = await prisma.roomType.findFirst({
      where: { id: input.roomTypeId, branchId: branch.id, deletedAt: null, status: "ACTIVE" },
    });
    if (!type) throw AppError.validation("That room type is not available at this branch.");
    if (guests > type.maximumGuests) {
      throw AppError.validation(`${type.name} sleeps up to ${type.maximumGuests} guests.`);
    }

    const { taxRatePercent, depositPercent, rules } = await loadSettings();

    // Extras are priced from the database, never from the client.
    const requested = new Map(input.extras.map((e) => [e.extraId, e.quantity]));
    const extras = requested.size
      ? await prisma.roomExtra.findMany({
          where: {
            id: { in: [...requested.keys()] },
            branchId: branch.id,
            deletedAt: null,
            isActive: true,
          },
        })
      : [];
    if (extras.length !== requested.size) throw AppError.validation("An extra is not available.");
    const extraLines = extras.map((e) => {
      const quantity = requested.get(e.id)!;
      return {
        name: e.name,
        unitPrice: Number(e.price),
        quantity,
        total: extraTotal(Number(e.price), e.pricingMode, quantity, nights, guests),
      };
    });

    const quote = buildQuote({
      nightly: nightlyRates(
        Number(type.basePrice),
        type.weekendPrice ? Number(type.weekendPrice) : null,
        stayNights(input.checkIn, nights),
      ),
      extrasTotal: extraLines.reduce((sum, l) => sum + l.total, 0),
      taxRatePercent,
      depositPercent,
      currency: branch.currency,
    });

    if (!options.byStaff) {
      const upcoming = await prisma.roomBooking.count({
        where: {
          userId: auth.userId,
          bookingStatus: { in: ACTIVE },
          checkOutDate: { gt: new Date() },
        },
      });
      if (upcoming >= ROOM_RULES.maxUpcomingPerCustomer) {
        throw AppError.conflict(
          "TOO_MANY_BOOKINGS",
          "You have too many upcoming stays. Cancel one to book another.",
        );
      }
    }

    let candidates = await freeRooms(branch.id, input.checkIn, input.checkOut, type.id);
    const pinned = "roomId" in input ? input.roomId : undefined;
    if (pinned) {
      candidates = candidates.filter((r) => r.id === pinned);
      if (!candidates.length) throw unavailable();
    }

    for (const room of candidates) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const created = await withResourceLock(room.id, (tx) =>
            tx.roomBooking.create({
              data: {
                reference: generateReference(),
                branchId: branch.id,
                roomTypeId: type.id,
                roomId: room.id,
                userId: options.byStaff ? null : auth.userId,
                createdByStaffId: options.byStaff ? auth.userId : null,
                guestName: input.guestName,
                guestEmail: input.guestEmail,
                guestPhone: input.guestPhone,
                checkInDate: parseDateOnly(input.checkIn),
                checkOutDate: parseDateOnly(input.checkOut),
                nightCount: nights,
                adultCount: input.adults,
                childCount: input.children,
                roomSubtotal: quote.roomSubtotal,
                extrasTotal: quote.extrasTotal,
                taxes: quote.taxes,
                discount: quote.discount,
                total: quote.total,
                deposit: quote.deposit,
                bookingStatus: "CONFIRMED",
                paymentStatus: "UNPAID",
                specialRequests: input.specialRequests,
                guests: { create: input.additionalGuests },
                extras: { create: extraLines },
              },
              include: bookingInclude,
            }),
          );
          publish(created, rules);
          if (!options.byStaff) {
            void events.roomBookingConfirmed({
              userId: created.userId,
              branchId: created.branchId,
              reference: created.reference,
              checkIn: input.checkIn,
            });
          }
          return toBookingDto(created, rules);
        } catch (error) {
          if (isOverlapViolation(error)) break; // taken just now; try the next room
          if (isUniqueViolation(error, "reference")) continue;
          if (isTransientConflict(error)) {
            // Deadlock victim of a concurrent booking: retry; the winner's row then shows as an overlap.
            await backoff(attempt);
            continue;
          }
          throw error;
        }
      }
    }
    throw unavailable();
  },

  // ── Customer ─────────────────────────────────────────────────────
  async listMine(userId: string) {
    const [records, { rules }] = await Promise.all([
      prisma.roomBooking.findMany({
        where: { userId },
        include: bookingInclude,
        orderBy: { checkInDate: "desc" },
        take: 100,
      }),
      loadSettings(),
    ]);
    return records.map((r) => toBookingDto(r, rules));
  },

  async cancelMine(auth: AuthContext, id: string) {
    const existing = await prisma.roomBooking.findFirst({
      where: { id, userId: auth.userId },
      include: bookingInclude,
    });
    if (!existing) throw AppError.notFound("Booking not found."); // also hides other people's bookings
    const { rules } = await loadSettings();
    if (existing.bookingStatus !== "PENDING" && existing.bookingStatus !== "CONFIRMED") {
      throw AppError.conflict("NOT_CANCELLABLE", "This booking can no longer be cancelled.");
    }
    const until = cancellableUntil(
      existing.checkInDate.toISOString().slice(0, 10),
      existing.branch.timezone,
      rules,
    );
    if (new Date() > until) {
      throw AppError.conflict(
        "CANCELLATION_WINDOW_PASSED",
        `Online cancellation closes ${rules.cancellationWindowHours} hours before check-in. Please contact the hotel.`,
      );
    }
    const { count } = await prisma.roomBooking.updateMany({
      where: { id, bookingStatus: { in: ["PENDING", "CONFIRMED"] } },
      data: { bookingStatus: "CANCELLED", cancelledAt: new Date() },
    });
    if (count === 0)
      throw AppError.conflict("NOT_CANCELLABLE", "This booking can no longer be cancelled.");
    const { record, dto } = await finish(id, rules);
    publish(record, rules);
    void audit(auth, {
      action: "room_booking.cancelled",
      entity: "room_booking",
      entityId: id,
      branchId: existing.branchId,
      previousValue: { status: existing.bookingStatus },
      newValue: { status: "CANCELLED", by: "customer" },
    });
    return dto;
  },

  // ── Staff ────────────────────────────────────────────────────────
  async listForStaff(
    auth: AuthContext,
    query: { branchId?: string; status?: RoomBookingStatus; from?: string; to?: string },
  ) {
    const branchId = scopeBranch(auth, query.branchId);
    const { rules } = await loadSettings();
    // Default window: everything that has not ended yet (plus yesterday's departures).
    const from = query.from ?? addDaysIso(new Date().toISOString().slice(0, 10), -1);
    const records = await prisma.roomBooking.findMany({
      where: {
        ...(branchId && { branchId }),
        ...(query.status && { bookingStatus: query.status }),
        checkOutDate: { gte: parseDateOnly(from) },
        ...(query.to && { checkInDate: { lte: parseDateOnly(query.to) } }),
      },
      include: bookingInclude,
      orderBy: [{ checkInDate: "asc" }, { createdAt: "asc" }],
      take: 300,
    });
    return records.map((r) => toBookingDto(r, rules));
  },

  async createForStaff(auth: AuthContext, input: CreateStaffRoomBookingInput) {
    assertBranchAccess(auth, input.branchId);
    return this.create(auth, input, { byStaff: true });
  },

  async setStatus(auth: AuthContext, id: string, next: RoomBookingStatus) {
    const existing = await prisma.roomBooking.findUnique({
      where: { id },
      include: { branch: true, room: true },
    });
    if (!existing) throw AppError.notFound("Booking not found.");
    assertBranchAccess(auth, existing.branchId);
    if (!ROOM_BOOKING_TRANSITIONS[existing.bookingStatus].includes(next)) {
      throw AppError.conflict(
        "INVALID_TRANSITION",
        `A ${existing.bookingStatus.toLowerCase().replace("_", " ")} booking cannot become ${next.toLowerCase().replace("_", " ")}.`,
      );
    }
    const { rules } = await loadSettings();
    const today = todayIn(existing.branch.timezone);
    const checkIn = existing.checkInDate.toISOString().slice(0, 10);
    const checkOut = existing.checkOutDate.toISOString().slice(0, 10);

    const guard = { id, bookingStatus: existing.bookingStatus };
    let applied: number;

    if (next === "CHECKED_IN") {
      if (today < checkIn) throw AppError.conflict("TOO_EARLY", `Check-in opens on ${checkIn}.`);
      if (today >= checkOut) throw AppError.conflict("STAY_OVER", "This stay's dates have passed.");
      const room = existing.room;
      if (!room) throw AppError.conflict("NO_ROOM_ASSIGNED", "Assign a room before checking in.");
      if (
        room.status === "OCCUPIED" ||
        room.status === "MAINTENANCE" ||
        room.status === "OUT_OF_SERVICE"
      ) {
        throw AppError.conflict(
          "ROOM_NOT_READY",
          `Room ${room.roomNumber} is ${room.status.toLowerCase().replace("_", " ")}. Assign another room.`,
        );
      }
      if (room.housekeepingStatus !== "CLEAN") {
        throw AppError.conflict(
          "ROOM_NOT_READY",
          `Room ${room.roomNumber} has not been cleaned yet. Finish housekeeping or assign another room.`,
        );
      }
      applied = await prisma.$transaction(async (tx) => {
        const { count } = await tx.roomBooking.updateMany({
          where: guard,
          data: { bookingStatus: "CHECKED_IN", checkedInAt: new Date() },
        });
        if (count === 1)
          await tx.room.update({ where: { id: room.id }, data: { status: "OCCUPIED" } });
        return count;
      });
    } else if (next === "CHECKED_OUT") {
      applied = await prisma.$transaction(async (tx) => {
        const { count } = await tx.roomBooking.updateMany({
          where: guard,
          data: { bookingStatus: "CHECKED_OUT", checkedOutAt: new Date() },
        });
        if (count === 1 && existing.roomId) {
          // The room is held out of service until housekeeping marks it clean.
          await tx.room.update({
            where: { id: existing.roomId },
            data: { status: "CLEANING", housekeepingStatus: "DIRTY" },
          });
          await tx.housekeepingTask.create({
            data: { roomId: existing.roomId, branchId: existing.branchId, type: "CHECKOUT_CLEAN" },
          });
        }
        return count;
      });
    } else {
      ({ count: applied } = await prisma.roomBooking.updateMany({
        where: guard,
        data: { bookingStatus: next, ...(next === "CANCELLED" && { cancelledAt: new Date() }) },
      }));
    }
    if (applied === 0) {
      throw AppError.conflict(
        "INVALID_TRANSITION",
        "The booking was just updated. Please refresh.",
      );
    }
    const { record, dto } = await finish(id, rules);
    publish(record, rules);
    if (next === "CANCELLED") {
      void audit(auth, {
        action: "room_booking.cancelled",
        entity: "room_booking",
        entityId: id,
        branchId: existing.branchId,
        previousValue: { status: existing.bookingStatus },
        newValue: { status: next, by: "staff" },
      });
    }
    return dto;
  },

  /** Moves a not-yet-arrived booking to another physical room of the booked type. */
  async assignRoom(auth: AuthContext, id: string, roomId: string) {
    const existing = await prisma.roomBooking.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Booking not found.");
    assertBranchAccess(auth, existing.branchId);
    if (existing.bookingStatus !== "PENDING" && existing.bookingStatus !== "CONFIRMED") {
      throw AppError.conflict(
        "INVALID_TRANSITION",
        "Only bookings that have not arrived can change rooms.",
      );
    }
    const room = await prisma.room.findFirst({
      where: { id: roomId, branchId: existing.branchId, deletedAt: null },
    });
    if (!room) throw AppError.validation("That room does not belong to this branch.");
    if (room.roomTypeId !== existing.roomTypeId) {
      throw AppError.validation("Choose a room of the type that was booked.");
    }
    if (room.status === "MAINTENANCE" || room.status === "OUT_OF_SERVICE") {
      throw AppError.validation("That room is not in service.");
    }
    try {
      await prisma.roomBooking.update({ where: { id }, data: { roomId } });
    } catch (error) {
      if (isOverlapViolation(error)) throw unavailable();
      throw error;
    }
    const { rules } = await loadSettings();
    const { record, dto } = await finish(id, rules);
    publish(record, rules);
    return dto;
  },

  /** Free rooms of the booked type for a booking's dates, for the "change room" picker. */
  async freeRoomsForBooking(auth: AuthContext, id: string) {
    const booking = await prisma.roomBooking.findUnique({ where: { id } });
    if (!booking) throw AppError.notFound("Booking not found.");
    assertBranchAccess(auth, booking.branchId);
    const rooms = await freeRooms(
      booking.branchId,
      booking.checkInDate.toISOString().slice(0, 10),
      booking.checkOutDate.toISOString().slice(0, 10),
      booking.roomTypeId,
    );
    return rooms.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      floor: r.floor,
      housekeepingStatus: r.housekeepingStatus,
    }));
  },
};
