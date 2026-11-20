import type { RoomBookingDto } from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { formatDateOnly } from "../../utils/dates";
import { localToUtc } from "../reservations/reservation.timing";

export const bookingInclude = {
  branch: { select: { name: true, timezone: true, currency: true } },
  roomType: { select: { name: true } },
  room: { select: { roomNumber: true } },
  guests: true,
  extras: true,
} satisfies Prisma.RoomBookingInclude;

export type BookingRecord = Prisma.RoomBookingGetPayload<{ include: typeof bookingInclude }>;

export interface StayRules {
  checkInTime: string;
  checkOutTime: string;
  cancellationWindowHours: number;
}

/** Free cancellation closes this long before the check-in time (branch-local). */
export function cancellableUntil(checkIn: string, timezone: string, rules: StayRules): Date {
  return new Date(
    localToUtc(checkIn, rules.checkInTime, timezone).getTime() -
      rules.cancellationWindowHours * 3_600_000,
  );
}

export function toBookingDto(b: BookingRecord, rules: StayRules, now = new Date()): RoomBookingDto {
  const checkIn = formatDateOnly(b.checkInDate);
  const until = cancellableUntil(checkIn, b.branch.timezone, rules);
  const holdsRoom = b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED";
  return {
    id: b.id,
    reference: b.reference,
    status: b.bookingStatus,
    paymentStatus: b.paymentStatus,
    branchId: b.branchId,
    branchName: b.branch.name,
    timezone: b.branch.timezone,
    roomTypeId: b.roomTypeId,
    roomTypeName: b.roomType.name,
    roomId: b.roomId,
    roomNumber: b.room?.roomNumber ?? null,
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestPhone: b.guestPhone,
    checkIn,
    checkOut: formatDateOnly(b.checkOutDate),
    nights: b.nightCount,
    adults: b.adultCount,
    children: b.childCount,
    extras: b.extras.map((e) => ({ name: e.name, quantity: e.quantity, total: Number(e.total) })),
    additionalGuests: b.guests.map((g) => ({ name: g.name, isChild: g.isChild })),
    roomSubtotal: Number(b.roomSubtotal),
    extrasTotal: Number(b.extrasTotal),
    taxes: Number(b.taxes),
    discount: Number(b.discount),
    total: Number(b.total),
    deposit: Number(b.deposit),
    specialRequests: b.specialRequests,
    checkInTime: rules.checkInTime,
    checkOutTime: rules.checkOutTime,
    currency: b.branch.currency,
    canCancel: holdsRoom && now <= until,
    cancellableUntil: holdsRoom ? until.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  };
}
