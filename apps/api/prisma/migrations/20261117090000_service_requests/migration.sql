-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_requests_branchId_status_createdAt_idx" ON "service_requests"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "service_requests_tableId_status_idx" ON "service_requests"("tableId", "status");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

