import { randomInt } from "node:crypto";

import {
  ACTIVE_RESERVATION_STATUSES,
  RESERVATION_RULES,
  RESERVATION_TRANSITIONS,
  SocketEvents,
  type AvailabilityDto,
  type AvailabilityQuery,
  type CreatePrivateReservationInput,
  type CreateReservationInput,
  type CreateStaffReservationInput,
  type OpeningHours,
  type PrivateAvailabilityDto,
  type ReservationStatus,
} from "@smartdine/shared";
import { Prisma, type RestaurantTable } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { describeWhen, events } from "../notifications/notify.events";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch, scopeBranch } from "../../shared/auth/branchAccess";
import { emitToBranch } from "../../sockets/emitter";
import type { AuthContext } from "../../types/express";
import {
  backoff,
  isTransientConflict,
  isUniqueViolation,
  withResourceLock,
} from "../../utils/prisma";
import { tableInclude, toTableDto } from "../tables/table.mapper";
import { reservationInclude, toReservationDto, type ReservationRecord } from "./reservation.mapper";
import {
  addMinutes,
  bookingTimeProblem,
  localToUtc,
  openWindow,
  overlaps,
  slotStarts,
  utcToLocalTime,
  type Window,
} from "./reservation.timing";

const ACTIVE = [...ACTIVE_RESERVATION_STATUSES];
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity

const generateReference = () =>
  `SD-${Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join("")}`;

const noAvailability = () =>
  AppError.conflict(
    "RESERVATION_CONFLICT",
    "No table is available at this time for your party size. Please choose another time.",
  );

/** True when Postgres rejected the insert because of our no-overlap exclusion constraints. */
function isOverlapViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /reservation_(table|room)_no_overlap|exclusion constraint|23P01/i.test(message);
}

async function loadRules() {
  const settings = await prisma.companySettings.findFirst();
  return {
    durationMinutes: settings?.reservationDurationMinutes ?? 90,
    cancellationWindowHours: settings?.cancellationWindowHours ?? 24,
  };
}

async function loadBookableBranch(branchId: string) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
  if (!branch) throw AppError.notFound("Branch not found.");
  return branch;
}

function assertBranchOpen(status: string) {
  if (status !== "OPEN") {
    throw AppError.conflict("BRANCH_NOT_OPEN", "This branch is not accepting bookings right now.");
  }
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Free, suitable tables for a time window, best fit (smallest capacity) first. */
async function freeTables(
  branchId: string,
  window: Window,
  guests: number,
  areaId?: string,
): Promise<(RestaurantTable & { diningArea: { id: string; name: string } })[]> {
  const tables = await prisma.restaurantTable.findMany({
    where: {
      branchId,
      deletedAt: null,
      status: { not: "OUT_OF_SERVICE" },
      capacity: { gte: guests },
      diningArea: { isActive: true, deletedAt: null, ...(areaId && { id: areaId }) },
    },
    include: { diningArea: { select: { id: true, name: true } } },
  });
  if (!tables.length) return [];
  const busy = await prisma.restaurantReservation.findMany({
    where: {
      tableId: { in: tables.map((t) => t.id) },
      status: { in: ACTIVE },
      startsAt: { lt: window.end },
      endsAt: { gt: window.start },
    },
    select: { tableId: true },
  });
  const busyIds = new Set(busy.map((b) => b.tableId));
  return tables
    .filter((t) => !busyIds.has(t.id))
    .sort((a, b) => a.capacity - b.capacity || naturalCompare(a.tableNumber, b.tableNumber));
}

async function finish(id: string) {
  const [record, rules] = await Promise.all([
    prisma.restaurantReservation.findUniqueOrThrow({ where: { id }, include: reservationInclude }),
    loadRules(),
  ]);
  return { record, dto: toReservationDto(record, rules) };
}

async function publish(record: ReservationRecord, rules: { cancellationWindowHours: number }) {
  emitToBranch(record.branchId, SocketEvents.RESERVATION_CHANGED, toReservationDto(record, rules));
}

export const reservationService = {
  // ── Availability (public) ────────────────────────────────────────
  async availability(query: AvailabilityQuery): Promise<AvailabilityDto> {
    const branch = await loadBookableBranch(query.branchId);
    const { durationMinutes } = await loadRules();
    const base = {
      date: query.date,
      guests: query.guests,
      durationMinutes,
      timezone: branch.timezone,
    };
    const window =
      branch.status === "OPEN"
        ? openWindow(branch.openingHours as OpeningHours | null, query.date, branch.timezone)
        : null;
    if (!window) return { ...base, slots: [], closed: true };

    const starts = slotStarts(window, durationMinutes);
    const tables = await prisma.restaurantTable.findMany({
      where: {
        branchId: branch.id,
        deletedAt: null,
        status: { not: "OUT_OF_SERVICE" },
        capacity: { gte: query.guests },
        diningArea: { isActive: true, deletedAt: null },
      },
      include: { diningArea: { select: { id: true, name: true } } },
    });
    const busy = tables.length
      ? await prisma.restaurantReservation.findMany({
          where: {
            tableId: { in: tables.map((t) => t.id) },
            status: { in: ACTIVE },
            startsAt: { lt: window.end },
            endsAt: { gt: window.start },
          },
          select: { tableId: true, startsAt: true, endsAt: true },
        })
      : [];

    const now = new Date();
    const slots = starts.map((start) => {
      const slot = { start, end: addMinutes(start, durationMinutes) };
      const bookable = bookingTimeProblem(start, now) === null;
      const areas = new Map<string, { id: string; name: string; tables: number }>();
      if (bookable) {
        for (const table of tables) {
          const taken = busy.some(
            (b) => b.tableId === table.id && overlaps(slot, { start: b.startsAt, end: b.endsAt }),
          );
          if (taken) continue;
          const area = areas.get(table.diningArea.id) ?? { ...table.diningArea, tables: 0 };
          area.tables += 1;
          areas.set(area.id, area);
        }
      }
      return {
        time: utcToLocalTime(start, branch.timezone),
        available: areas.size > 0,
        areas: [...areas.values()].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
    return { ...base, slots, closed: false };
  },

  async privateAvailability(roomId: string, date: string): Promise<PrivateAvailabilityDto> {
    const room = await prisma.privateDiningRoom.findFirst({
      where: { id: roomId, deletedAt: null, isActive: true },
      include: { branch: true },
    });
    if (!room) throw AppError.notFound("Private dining room not found.");
    const tz = room.branch.timezone;
    const hours = (room.openingTimes ?? room.branch.openingHours) as OpeningHours | null;
    const window = openWindow(hours, date, tz);
    const base = { roomId, date, timezone: tz };
    if (!window) return { ...base, closed: true, opens: null, closes: null, busy: [] };

    const busy = await prisma.restaurantReservation.findMany({
      where: {
        privateRoomId: roomId,
        status: { in: ACTIVE },
        startsAt: { lt: window.end },
        endsAt: { gt: window.start },
      },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, endsAt: true },
    });
    return {
      ...base,
      closed: false,
      opens: utcToLocalTime(window.start, tz),
      closes: utcToLocalTime(window.end, tz),
      busy: busy.map((b) => ({
        start: utcToLocalTime(b.startsAt, tz),
        end: utcToLocalTime(b.endsAt, tz),
      })),
    };
  },

  // ── Booking ──────────────────────────────────────────────────────
  /**
   * Books the best-fitting free table. The exclusion constraint is the final arbiter: if two
   * requests race for the same table, the loser simply moves on to the next candidate.
   */
  async createTableReservation(
    auth: AuthContext,
    input: CreateStaffReservationInput | CreateReservationInput,
    options: { byStaff: boolean },
  ) {
    const branch = await loadBookableBranch(input.branchId);
    assertBranchOpen(branch.status);
    const rules = await loadRules();

    const day = openWindow(branch.openingHours as OpeningHours | null, input.date, branch.timezone);
    if (!day) throw AppError.conflict("BRANCH_CLOSED", "The restaurant is closed on that day.");
    const startsAt = localToUtc(input.date, input.time, branch.timezone);
    if (!slotStarts(day, rules.durationMinutes).some((s) => s.getTime() === startsAt.getTime())) {
      throw AppError.validation(
        "That time is outside booking hours. Please choose an available slot.",
      );
    }
    const timeProblem = bookingTimeProblem(startsAt);
    if (timeProblem) throw AppError.validation(timeProblem);

    if (!options.byStaff) {
      const upcoming = await prisma.restaurantReservation.count({
        where: { userId: auth.userId, status: { in: ACTIVE }, startsAt: { gt: new Date() } },
      });
      if (upcoming >= RESERVATION_RULES.maxUpcomingPerCustomer) {
        throw AppError.conflict(
          "TOO_MANY_RESERVATIONS",
          `You can hold up to ${RESERVATION_RULES.maxUpcomingPerCustomer} upcoming reservations. Cancel one to book another.`,
        );
      }
    }

    const window = { start: startsAt, end: addMinutes(startsAt, rules.durationMinutes) };
    const pinned = "tableId" in input ? input.tableId : undefined;
    let candidates = await freeTables(branch.id, window, input.partySize, input.diningAreaId);
    if (pinned) {
      candidates = candidates.filter((t) => t.id === pinned);
      if (!candidates.length) throw noAvailability();
    }

    for (let attempt = 0; attempt < candidates.length; attempt++) {
      const table = candidates[attempt]!;
      for (let tryNo = 0; tryNo < 4; tryNo++) {
        try {
          const created = await withResourceLock(table.id, (tx) =>
            tx.restaurantReservation.create({
              data: {
                reference: generateReference(),
                type: "TABLE",
                // Table bookings are confirmed instantly; staff bookings are confirmed by definition.
                status: "CONFIRMED",
                branchId: branch.id,
                tableId: table.id,
                diningAreaId: table.diningAreaId,
                userId: options.byStaff ? null : auth.userId,
                createdByStaffId: options.byStaff ? auth.userId : null,
                guestName: input.guestName,
                guestEmail: input.guestEmail,
                guestPhone: input.guestPhone,
                partySize: input.partySize,
                startsAt: window.start,
                endsAt: window.end,
                specialRequest: input.specialRequest,
              },
              include: reservationInclude,
            }),
          );
          await publish(created, rules);
          if (!options.byStaff) {
            void events.reservationConfirmed({
              userId: created.userId,
              branchId: created.branchId,
              reference: created.reference,
              when: await describeWhen(created.branchId, created.startsAt),
            });
          }
          return toReservationDto(created, rules);
        } catch (error) {
          if (isOverlapViolation(error)) break; // someone took this table; try the next one
          if (isUniqueViolation(error, "reference")) continue;
          if (isTransientConflict(error)) {
            await backoff(tryNo); // deadlock victim: retry, the winner's row then shows as an overlap
            continue;
          }
          throw error;
        }
      }
    }
    throw noAvailability();
  },

  async createPrivateReservation(auth: AuthContext, input: CreatePrivateReservationInput) {
    const room = await prisma.privateDiningRoom.findFirst({
      where: { id: input.roomId, deletedAt: null, isActive: true },
      include: { branch: true },
    });
    if (!room) throw AppError.notFound("Private dining room not found.");
    assertBranchOpen(room.branch.status);
    const tz = room.branch.timezone;
    const rules = await loadRules();

    if (input.partySize < room.minimumGuests || input.partySize > room.maximumGuests) {
      throw AppError.validation(
        `${room.name} hosts ${room.minimumGuests}–${room.maximumGuests} guests.`,
      );
    }
    const hours = (room.openingTimes ?? room.branch.openingHours) as OpeningHours | null;
    const window = openWindow(hours, input.date, tz);
    if (!window) throw AppError.conflict("ROOM_CLOSED", "This room is not available on that day.");

    const startsAt = localToUtc(input.date, input.time, tz);
    const endsAt = addMinutes(startsAt, input.durationMinutes);
    if (startsAt < window.start || endsAt > window.end) {
      throw AppError.validation(
        `The booking must fall within ${utcToLocalTime(window.start, tz)}–${utcToLocalTime(window.end, tz)}.`,
      );
    }
    const timeProblem = bookingTimeProblem(startsAt);
    if (timeProblem) throw AppError.validation(timeProblem);

    const upcoming = await prisma.restaurantReservation.count({
      where: { userId: auth.userId, status: { in: ACTIVE }, startsAt: { gt: new Date() } },
    });
    if (upcoming >= RESERVATION_RULES.maxUpcomingPerCustomer) {
      throw AppError.conflict("TOO_MANY_RESERVATIONS", "You have too many upcoming reservations.");
    }

    for (let tryNo = 0; tryNo < 4; tryNo++) {
      try {
        const created = await withResourceLock(room.id, (tx) =>
          tx.restaurantReservation.create({
            data: {
              reference: generateReference(),
              type: "PRIVATE_DINING",
              // Private events need approval (and a deposit) from the restaurant.
              status: "PENDING",
              branchId: room.branchId,
              privateRoomId: room.id,
              userId: auth.userId,
              guestName: input.guestName,
              guestEmail: input.guestEmail,
              guestPhone: input.guestPhone,
              partySize: input.partySize,
              startsAt,
              endsAt,
              occasion: input.occasion,
              specialRequest: input.specialRequest,
              depositAmount: room.deposit,
              estimatedCost: new Prisma.Decimal(room.hourlyRate)
                .mul(input.durationMinutes)
                .div(60)
                .toDecimalPlaces(2),
            },
            include: reservationInclude,
          }),
        );
        await publish(created, rules);
        return toReservationDto(created, rules);
      } catch (error) {
        if (isOverlapViolation(error)) {
          throw AppError.conflict(
            "RESERVATION_CONFLICT",
            "The room is already booked for part of that time. Please choose another time.",
          );
        }
        if (isUniqueViolation(error, "reference")) continue;
        throw error;
      }
    }
    throw AppError.conflict(
      "RESERVATION_CONFLICT",
      "Could not create the reservation. Please retry.",
    );
  },

  // ── Customer ─────────────────────────────────────────────────────
  async listMine(userId: string) {
    const [records, rules] = await Promise.all([
      prisma.restaurantReservation.findMany({
        where: { userId },
        include: reservationInclude,
        orderBy: { startsAt: "desc" },
        take: 100,
      }),
      loadRules(),
    ]);
    return records.map((r) => toReservationDto(r, rules));
  },

  async cancelMine(auth: AuthContext, id: string) {
    const existing = await prisma.restaurantReservation.findFirst({
      where: { id, userId: auth.userId },
    });
    // Someone else's reservation looks exactly like a missing one.
    if (!existing) throw AppError.notFound("Reservation not found.");
    const rules = await loadRules();

    if (existing.status !== "PENDING" && existing.status !== "CONFIRMED") {
      throw AppError.conflict("NOT_CANCELLABLE", "This reservation can no longer be cancelled.");
    }
    const until = existing.startsAt.getTime() - rules.cancellationWindowHours * 3_600_000;
    if (Date.now() > until) {
      throw AppError.conflict(
        "CANCELLATION_WINDOW_PASSED",
        `Online cancellation closes ${rules.cancellationWindowHours} hours before the reservation. Please call the restaurant.`,
      );
    }
    // Conditional update: a concurrent staff action cannot be overwritten.
    const { count } = await prisma.restaurantReservation.updateMany({
      where: { id, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Cancelled by customer" },
    });
    if (count === 0) {
      throw AppError.conflict("NOT_CANCELLABLE", "This reservation can no longer be cancelled.");
    }
    const { record, dto } = await finish(id);
    await publish(record, rules);
    void audit(auth, {
      action: "reservation.cancelled",
      entity: "reservation",
      entityId: id,
      branchId: existing.branchId,
      previousValue: { status: existing.status },
      newValue: { status: "CANCELLED", by: "customer" },
    });
    void events.reservationCancelled(
      {
        branchId: existing.branchId,
        guestName: existing.guestName,
        reference: existing.reference,
        when: await describeWhen(existing.branchId, existing.startsAt),
      },
      null,
    );
    return dto;
  },

  // ── Staff ────────────────────────────────────────────────────────
  async listForStaff(
    auth: AuthContext,
    query: {
      branchId?: string;
      date?: string;
      upcoming?: "true" | "false";
      status?: ReservationStatus;
      type?: "TABLE" | "PRIVATE_DINING";
    },
  ) {
    // A calendar date only means something in one branch's timezone, so it needs a branch.
    const branchId = query.date
      ? requireBranch(auth, query.branchId)
      : scopeBranch(auth, query.branchId);
    let range: Prisma.DateTimeFilter | undefined;
    if (query.date) {
      const branch = await loadBookableBranch(branchId!);
      const start = localToUtc(query.date, "00:00", branch.timezone);
      range = { gte: start, lt: addMinutes(start, 24 * 60) };
    }
    const [records, rules] = await Promise.all([
      prisma.restaurantReservation.findMany({
        where: {
          ...(branchId && { branchId }),
          ...(range && { startsAt: range }),
          // Still-running bookings count as upcoming, so judge by when they end.
          ...(!query.date && query.upcoming === "true" && { endsAt: { gt: new Date() } }),
          ...(query.status && { status: query.status }),
          ...(query.type && { type: query.type }),
        },
        include: reservationInclude,
        orderBy: { startsAt: "asc" },
        take: 300,
      }),
      loadRules(),
    ]);
    return records.map((r) => toReservationDto(r, rules));
  },

  async createForStaff(auth: AuthContext, input: CreateStaffReservationInput) {
    assertBranchAccess(auth, input.branchId);
    return this.createTableReservation(auth, input, { byStaff: true });
  },

  async setStatus(auth: AuthContext, id: string, next: ReservationStatus, reason?: string) {
    const existing = await prisma.restaurantReservation.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Reservation not found.");
    assertBranchAccess(auth, existing.branchId);

    if (!RESERVATION_TRANSITIONS[existing.status].includes(next)) {
      throw AppError.conflict(
        "INVALID_TRANSITION",
        `A ${existing.status.toLowerCase().replace("_", " ")} reservation cannot become ${next.toLowerCase().replace("_", " ")}.`,
      );
    }
    // Conditional on the status we validated against, so concurrent updates cannot skip steps.
    const { count } = await prisma.restaurantReservation.updateMany({
      where: { id, status: existing.status },
      data: {
        status: next,
        ...(next === "CANCELLED" && {
          cancelledAt: new Date(),
          cancelReason: reason ?? "Cancelled by staff",
        }),
      },
    });
    if (count === 0) {
      throw AppError.conflict(
        "INVALID_TRANSITION",
        "The reservation was just updated. Please refresh.",
      );
    }

    // Seating a table reservation marks the table occupied for the floor.
    if (next === "SEATED" && existing.tableId) {
      const table = await prisma.restaurantTable.update({
        where: { id: existing.tableId },
        data: { status: "OCCUPIED" },
        include: tableInclude,
      });
      emitToBranch(table.branchId, SocketEvents.TABLE_UPDATED, toTableDto(table));
    }

    const { record, dto } = await finish(id);
    await publish(record, await loadRules());
    if (next === "CHECKED_IN") {
      void events.guestArrived(
        {
          branchId: existing.branchId,
          guestName: existing.guestName,
          partySize: existing.partySize,
        },
        auth.userId,
      );
    }
    if (next === "CANCELLED") {
      void audit(auth, {
        action: "reservation.cancelled",
        entity: "reservation",
        entityId: id,
        branchId: existing.branchId,
        previousValue: { status: existing.status },
        newValue: { status: next, reason: reason ?? null, by: "staff" },
      });
      void events.reservationCancelled(
        {
          branchId: existing.branchId,
          guestName: existing.guestName,
          reference: existing.reference,
          when: await describeWhen(existing.branchId, existing.startsAt),
        },
        auth.userId,
      );
    }
    return dto;
  },
};
