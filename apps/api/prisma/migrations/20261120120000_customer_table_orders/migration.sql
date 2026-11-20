-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "placedByUserId" UUID;

-- CreateIndex
CREATE INDEX "orders_placedByUserId_idx" ON "orders"("placedByUserId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_placedByUserId_fkey" FOREIGN KEY ("placedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

