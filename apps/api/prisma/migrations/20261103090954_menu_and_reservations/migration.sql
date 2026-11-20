-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'TEMPORARILY_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "MealPeriod" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "KitchenStation" AS ENUM ('MAIN_KITCHEN', 'GRILL', 'PIZZA', 'DESSERT', 'BEVERAGE', 'BAR');

-- CreateEnum
CREATE TYPE "ReservationType" AS ENUM ('TABLE', 'PRIVATE_DINING');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergens" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "allergens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "comparePrice" DECIMAL(10,2),
    "costPrice" DECIMAL(10,2),
    "image" TEXT,
    "gallery" TEXT[],
    "preparationTime" INTEGER,
    "calories" INTEGER,
    "spiceLevel" INTEGER NOT NULL DEFAULT 0,
    "vegetarian" BOOLEAN NOT NULL DEFAULT false,
    "vegan" BOOLEAN NOT NULL DEFAULT false,
    "halal" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "newItem" BOOLEAN NOT NULL DEFAULT false,
    "availability" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "mealPeriods" "MealPeriod"[],
    "kitchenStation" "KitchenStation" NOT NULL DEFAULT 'MAIN_KITCHEN',
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_reservations" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(12) NOT NULL,
    "type" "ReservationType" NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "branchId" UUID NOT NULL,
    "tableId" UUID,
    "privateRoomId" UUID,
    "diningAreaId" UUID,
    "userId" UUID,
    "createdByStaffId" UUID,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "specialRequest" TEXT,
    "occasion" TEXT,
    "depositAmount" DECIMAL(12,2),
    "estimatedCost" DECIMAL(12,2),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AllergenToMenuItem" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AllergenToMenuItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_slug_key" ON "menu_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "allergens_name_key" ON "allergens"("name");

-- CreateIndex
CREATE INDEX "menu_items_branchId_categoryId_idx" ON "menu_items"("branchId", "categoryId");

-- CreateIndex
CREATE INDEX "menu_items_branchId_availability_idx" ON "menu_items"("branchId", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_reservations_reference_key" ON "restaurant_reservations"("reference");

-- CreateIndex
CREATE INDEX "restaurant_reservations_branchId_startsAt_idx" ON "restaurant_reservations"("branchId", "startsAt");

-- CreateIndex
CREATE INDEX "restaurant_reservations_userId_startsAt_idx" ON "restaurant_reservations"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "restaurant_reservations_tableId_startsAt_idx" ON "restaurant_reservations"("tableId", "startsAt");

-- CreateIndex
CREATE INDEX "restaurant_reservations_privateRoomId_startsAt_idx" ON "restaurant_reservations"("privateRoomId", "startsAt");

-- CreateIndex
CREATE INDEX "_AllergenToMenuItem_B_index" ON "_AllergenToMenuItem"("B");

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_reservations" ADD CONSTRAINT "restaurant_reservations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_reservations" ADD CONSTRAINT "restaurant_reservations_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_reservations" ADD CONSTRAINT "restaurant_reservations_privateRoomId_fkey" FOREIGN KEY ("privateRoomId") REFERENCES "private_dining_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_reservations" ADD CONSTRAINT "restaurant_reservations_diningAreaId_fkey" FOREIGN KEY ("diningAreaId") REFERENCES "dining_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_reservations" ADD CONSTRAINT "restaurant_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AllergenToMenuItem" ADD CONSTRAINT "_AllergenToMenuItem_A_fkey" FOREIGN KEY ("A") REFERENCES "allergens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AllergenToMenuItem" ADD CONSTRAINT "_AllergenToMenuItem_B_fkey" FOREIGN KEY ("B") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
