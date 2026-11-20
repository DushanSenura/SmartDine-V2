-- CreateIndex
CREATE INDEX "audit_logs_branchId_createdAt_idx" ON "audit_logs"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "bills_branchId_paidAt_idx" ON "bills"("branchId", "paidAt");

-- CreateIndex
CREATE INDEX "bills_customerId_idx" ON "bills"("customerId");

-- CreateIndex
CREATE INDEX "bills_roomBookingId_idx" ON "bills"("roomBookingId");

-- CreateIndex
CREATE INDEX "orders_branchId_createdAt_idx" ON "orders"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_roomBookingId_idx" ON "orders"("roomBookingId");

-- CreateIndex
CREATE INDEX "orders_roomId_idx" ON "orders"("roomId");

-- CreateIndex
CREATE INDEX "refunds_createdAt_idx" ON "refunds"("createdAt");

