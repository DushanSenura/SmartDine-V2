import type { Occasion, ReservationDto } from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { toNumber } from "../../utils/prisma";

export const reservationInclude = {
  branch: { select: { name: true, timezone: true } },
  table: { select: { tableNumber: true } },
  diningArea: { select: { name: true } },
  privateRoom: { select: { name: true } },
} satisfies Prisma.RestaurantReservationInclude;

export type ReservationRecord = Prisma.RestaurantReservationGetPayload<{
  include: typeof reservationInclude;
}>;

export function toReservationDto(
  r: ReservationRecord,
  options: { cancellationWindowHours: number; now?: Date },
): ReservationDto {
  const now = options.now ?? new Date();
  const cancellableUntil = new Date(
    r.startsAt.getTime() - options.cancellationWindowHours * 3_600_000,
  );
  const cancellable =
    (r.status === "PENDING" || r.status === "CONFIRMED") && now <= cancellableUntil;

  return {
    id: r.id,
    reference: r.reference,
    type: r.type,
    status: r.status,
    branchId: r.branchId,
    branchName: r.branch.name,
    timezone: r.branch.timezone,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    partySize: r.partySize,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    guestPhone: r.guestPhone,
    specialRequest: r.specialRequest,
    occasion: r.occasion as Occasion | null,
    tableId: r.tableId,
    tableNumber: r.table?.tableNumber ?? null,
    areaName: r.diningArea?.name ?? null,
    roomName: r.privateRoom?.name ?? null,
    depositAmount: toNumber(r.depositAmount),
    estimatedCost: toNumber(r.estimatedCost),
    canCancel: cancellable,
    cancellableUntil: ["PENDING", "CONFIRMED"].includes(r.status)
      ? cancellableUntil.toISOString()
      : null,
  };
}
