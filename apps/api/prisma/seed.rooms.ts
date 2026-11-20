import type { BedType, ExtraPricingMode, PrismaClient } from "@prisma/client";

import { slugify } from "../src/utils/slug";

interface DemoType {
  name: string;
  description: string;
  maximumGuests: number;
  bedType: BedType;
  numberOfBeds: number;
  roomSize: number;
  basePrice: number;
  weekendPrice: number;
  amenities: string[];
  floor: number;
  rooms: string[];
}

const TYPES: DemoType[] = [
  {
    name: "Standard Room",
    description: "A calm, comfortable room with everything you need for a short stay.",
    maximumGuests: 2,
    bedType: "DOUBLE",
    numberOfBeds: 1,
    roomSize: 22,
    basePrice: 18000,
    weekendPrice: 21000,
    amenities: ["Wi-Fi", "Air conditioning", "Smart TV", "Safe"],
    floor: 1,
    rooms: ["101", "102", "103", "104"],
  },
  {
    name: "Deluxe Room",
    description: "More space, a work desk and a balcony overlooking the city.",
    maximumGuests: 3,
    bedType: "QUEEN",
    numberOfBeds: 1,
    roomSize: 30,
    basePrice: 28000,
    weekendPrice: 32000,
    amenities: [
      "Wi-Fi",
      "Air conditioning",
      "Smart TV",
      "Mini bar",
      "Balcony",
      "City view",
      "Workspace",
      "Breakfast",
    ],
    floor: 2,
    rooms: ["201", "202", "203", "204"],
  },
  {
    name: "Family Suite",
    description: "Two connected sleeping areas, a lounge and a bathtub. Room for the whole family.",
    maximumGuests: 5,
    bedType: "KING",
    numberOfBeds: 2,
    roomSize: 55,
    basePrice: 48000,
    weekendPrice: 55000,
    amenities: [
      "Wi-Fi",
      "Air conditioning",
      "Smart TV",
      "Mini bar",
      "Bathtub",
      "Room service",
      "Breakfast",
      "Parking",
    ],
    floor: 3,
    rooms: ["301", "302"],
  },
];

const EXTRAS: {
  name: string;
  description: string;
  price: number;
  pricingMode: ExtraPricingMode;
}[] = [
  {
    name: "Breakfast",
    description: "Full breakfast each morning",
    price: 1800,
    pricingMode: "PER_GUEST",
  },
  {
    name: "Airport transfer",
    description: "Private car, one way",
    price: 6500,
    pricingMode: "PER_STAY",
  },
  {
    name: "Extra bed",
    description: "Folding bed with linen",
    price: 3000,
    pricingMode: "PER_NIGHT",
  },
];

/** Development-only sample accommodation so the Rooms pages are not empty. Idempotent. */
export async function seedDemoRooms(prisma: PrismaClient, branchId: string) {
  if ((await prisma.roomType.count({ where: { branchId } })) > 0) return;

  for (const { rooms, floor, ...type } of TYPES) {
    const created = await prisma.roomType.create({
      data: { ...type, branchId, slug: slugify(type.name) },
    });
    await prisma.room.createMany({
      data: rooms.map((roomNumber) => ({ branchId, roomTypeId: created.id, roomNumber, floor })),
    });
  }
  await prisma.roomExtra.createMany({ data: EXTRAS.map((extra) => ({ ...extra, branchId })) });
}
