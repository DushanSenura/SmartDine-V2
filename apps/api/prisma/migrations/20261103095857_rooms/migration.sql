-- CreateEnum
CREATE TYPE "BedType" AS ENUM ('SINGLE', 'TWIN', 'DOUBLE', 'QUEEN', 'KING');

-- CreateEnum
CREATE TYPE "RoomTypeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'CLEANING', 'MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "HousekeepingStatus" AS ENUM ('CLEAN', 'DIRTY', 'CLEANING', 'INSPECTION', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "HousekeepingTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "HousekeepingTaskType" AS ENUM ('CHECKOUT_CLEAN', 'ROUTINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ExtraPricingMode" AS ENUM ('PER_STAY', 'PER_NIGHT', 'PER_GUEST');

-- CreateEnum
CREATE TYPE "RoomBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "RoomPaymentStatus" AS ENUM ('UNPAID', 'DEPOSIT_PAID', 'PAID', 'REFUNDED');

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "checkInTime" VARCHAR(5) NOT NULL DEFAULT '14:00',
ADD COLUMN     "checkOutTime" VARCHAR(5) NOT NULL DEFAULT '11:00',
ADD COLUMN     "roomDepositPercent" DECIMAL(5,2) NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "maximumGuests" INTEGER NOT NULL,
    "bedType" "BedType" NOT NULL,
    "numberOfBeds" INTEGER NOT NULL DEFAULT 1,
    "roomSize" INTEGER,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "weekendPrice" DECIMAL(12,2),
    "images" TEXT[],
    "amenities" TEXT[],
    "status" "RoomTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "roomTypeId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "roomNumber" VARCHAR(16) NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "housekeepingStatus" "HousekeepingStatus" NOT NULL DEFAULT 'CLEAN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_extras" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "pricingMode" "ExtraPricingMode" NOT NULL DEFAULT 'PER_STAY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "room_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_bookings" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(12) NOT NULL,
    "branchId" UUID NOT NULL,
    "roomTypeId" UUID NOT NULL,
    "roomId" UUID,
    "userId" UUID,
    "createdByStaffId" UUID,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "nightCount" INTEGER NOT NULL,
    "adultCount" INTEGER NOT NULL,
    "childCount" INTEGER NOT NULL DEFAULT 0,
    "roomSubtotal" DECIMAL(12,2) NOT NULL,
    "extrasTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentStatus" "RoomPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "bookingStatus" "RoomBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "specialRequests" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_booking_guests" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isChild" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "room_booking_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_booking_extras" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "room_booking_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeping_tasks" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "type" "HousekeepingTaskType" NOT NULL DEFAULT 'CHECKOUT_CLEAN',
    "status" "HousekeepingTaskStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_types_branchId_status_idx" ON "room_types"("branchId", "status");

-- CreateIndex
CREATE INDEX "rooms_branchId_status_idx" ON "rooms"("branchId", "status");

-- CreateIndex
CREATE INDEX "rooms_roomTypeId_idx" ON "rooms"("roomTypeId");

-- CreateIndex
CREATE INDEX "room_extras_branchId_idx" ON "room_extras"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "room_bookings_reference_key" ON "room_bookings"("reference");

-- CreateIndex
CREATE INDEX "room_bookings_branchId_checkInDate_idx" ON "room_bookings"("branchId", "checkInDate");

-- CreateIndex
CREATE INDEX "room_bookings_branchId_checkOutDate_idx" ON "room_bookings"("branchId", "checkOutDate");

-- CreateIndex
CREATE INDEX "room_bookings_roomId_checkInDate_idx" ON "room_bookings"("roomId", "checkInDate");

-- CreateIndex
CREATE INDEX "room_bookings_userId_checkInDate_idx" ON "room_bookings"("userId", "checkInDate");

-- CreateIndex
CREATE INDEX "room_booking_guests_bookingId_idx" ON "room_booking_guests"("bookingId");

-- CreateIndex
CREATE INDEX "room_booking_extras_bookingId_idx" ON "room_booking_extras"("bookingId");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_branchId_status_idx" ON "housekeeping_tasks"("branchId", "status");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_roomId_idx" ON "housekeeping_tasks"("roomId");

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_extras" ADD CONSTRAINT "room_extras_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_guests" ADD CONSTRAINT "room_booking_guests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "room_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_extras" ADD CONSTRAINT "room_booking_extras_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "room_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
