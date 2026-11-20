-- Database-level guarantees that Prisma cannot express.

-- 1) No double booking. Two ACTIVE reservations can never overlap on the same table or the same
--    private room, even under concurrent requests. Cancelled / completed / no-show bookings
--    release the slot automatically because they fall outside the WHERE clause.
--    Keep the status list in sync with ACTIVE_RESERVATION_STATUSES in packages/shared.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "restaurant_reservations"
  ADD CONSTRAINT "reservation_table_no_overlap"
  EXCLUDE USING gist (
    "tableId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("tableId" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED'));

ALTER TABLE "restaurant_reservations"
  ADD CONSTRAINT "reservation_room_no_overlap"
  EXCLUDE USING gist (
    "privateRoomId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("privateRoomId" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED'));

ALTER TABLE "restaurant_reservations"
  ADD CONSTRAINT "reservation_ends_after_start" CHECK ("endsAt" > "startsAt");

ALTER TABLE "restaurant_reservations"
  ADD CONSTRAINT "reservation_has_one_target"
  CHECK (
    ("type" = 'TABLE' AND "privateRoomId" IS NULL)
    OR ("type" = 'PRIVATE_DINING' AND "tableId" IS NULL AND "privateRoomId" IS NOT NULL)
  );

-- 2) A menu item slug is unique per branch among non-deleted items.
CREATE UNIQUE INDEX "menu_items_branch_slug_active_key"
  ON "menu_items" ("branchId", "slug")
  WHERE "deletedAt" IS NULL;
