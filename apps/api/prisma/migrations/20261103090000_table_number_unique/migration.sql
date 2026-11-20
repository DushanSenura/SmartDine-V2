-- A table number must be unique within a branch among tables that have not been soft-deleted.
-- Prisma cannot express partial unique indexes in schema.prisma, so it is maintained here.
CREATE UNIQUE INDEX "restaurant_tables_branch_number_active_key"
  ON "restaurant_tables" ("branchId", "tableNumber")
  WHERE "deletedAt" IS NULL;
