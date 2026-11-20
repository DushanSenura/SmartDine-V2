-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'ORDERING', 'WAITING_FOR_FOOD', 'DINING', 'PAYMENT_PENDING', 'CLEANING', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('SQUARE', 'RECTANGLE', 'ROUND');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'LKR',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "managerId" UUID,
ADD COLUMN     "openingHours" JSONB,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Colombo';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "company_settings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "serviceChargePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "reservationDurationMinutes" INTEGER NOT NULL DEFAULT 90,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
    "receiptFooter" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "employeeId" VARCHAR(32) NOT NULL,
    "address" TEXT,
    "dateOfBirth" DATE,
    "department" TEXT,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" DATE,
    "profileImageUrl" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_shifts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" UUID,
    "dayOff" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "scheduled_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "scheduledShiftId" UUID,
    "clockInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOutAt" TIMESTAMP(3),

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_areas" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 1200,
    "height" INTEGER NOT NULL DEFAULT 700,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "dining_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "diningAreaId" UUID NOT NULL,
    "tableNumber" VARCHAR(16) NOT NULL,
    "name" TEXT,
    "section" TEXT,
    "capacity" INTEGER NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "shape" "TableShape" NOT NULL DEFAULT 'SQUARE',
    "positionX" INTEGER NOT NULL DEFAULT 40,
    "positionY" INTEGER NOT NULL DEFAULT 40,
    "width" INTEGER NOT NULL DEFAULT 80,
    "height" INTEGER NOT NULL DEFAULT 80,
    "assignedWaiterId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_dining_rooms" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL,
    "minimumGuests" INTEGER NOT NULL DEFAULT 1,
    "maximumGuests" INTEGER NOT NULL,
    "images" TEXT[],
    "amenities" TEXT[],
    "minimumSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "openingTimes" JSONB,
    "specialRules" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "private_dining_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_companyId_key" ON "company_settings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_userId_key" ON "staff_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_employeeId_key" ON "staff_profiles"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_companyId_name_key" ON "shifts"("companyId", "name");

-- CreateIndex
CREATE INDEX "scheduled_shifts_branchId_date_idx" ON "scheduled_shifts"("branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_shifts_userId_date_key" ON "scheduled_shifts"("userId", "date");

-- CreateIndex
CREATE INDEX "attendance_userId_clockInAt_idx" ON "attendance"("userId", "clockInAt");

-- CreateIndex
CREATE INDEX "attendance_branchId_clockInAt_idx" ON "attendance"("branchId", "clockInAt");

-- CreateIndex
CREATE INDEX "dining_areas_branchId_idx" ON "dining_areas"("branchId");

-- CreateIndex
CREATE INDEX "restaurant_tables_branchId_status_idx" ON "restaurant_tables"("branchId", "status");

-- CreateIndex
CREATE INDEX "restaurant_tables_diningAreaId_idx" ON "restaurant_tables"("diningAreaId");

-- CreateIndex
CREATE INDEX "restaurant_tables_assignedWaiterId_idx" ON "restaurant_tables"("assignedWaiterId");

-- CreateIndex
CREATE INDEX "private_dining_rooms_branchId_idx" ON "private_dining_rooms"("branchId");

-- CreateIndex
CREATE INDEX "branches_managerId_idx" ON "branches"("managerId");

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_shifts" ADD CONSTRAINT "scheduled_shifts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_shifts" ADD CONSTRAINT "scheduled_shifts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_shifts" ADD CONSTRAINT "scheduled_shifts_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_scheduledShiftId_fkey" FOREIGN KEY ("scheduledShiftId") REFERENCES "scheduled_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_diningAreaId_fkey" FOREIGN KEY ("diningAreaId") REFERENCES "dining_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_assignedWaiterId_fkey" FOREIGN KEY ("assignedWaiterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_dining_rooms" ADD CONSTRAINT "private_dining_rooms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
