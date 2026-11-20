import type { RoomExtraDto, RoomTypeDto } from "@smartdine/shared";
import type { RoomExtra, RoomType } from "@prisma/client";

import { toNumber } from "../../utils/prisma";

export const toRoomTypeDto = (rt: RoomType, roomCount?: number): RoomTypeDto => ({
  id: rt.id,
  branchId: rt.branchId,
  name: rt.name,
  slug: rt.slug,
  description: rt.description,
  maximumGuests: rt.maximumGuests,
  bedType: rt.bedType,
  numberOfBeds: rt.numberOfBeds,
  roomSize: rt.roomSize,
  basePrice: Number(rt.basePrice),
  weekendPrice: toNumber(rt.weekendPrice),
  images: rt.images,
  amenities: rt.amenities,
  status: rt.status,
  ...(roomCount !== undefined && { roomCount }),
});

export const toExtraDto = (e: RoomExtra): RoomExtraDto => ({
  id: e.id,
  branchId: e.branchId,
  name: e.name,
  description: e.description,
  price: Number(e.price),
  pricingMode: e.pricingMode,
  isActive: e.isActive,
});
