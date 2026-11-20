-- Database-level guarantees for accommodation that Prisma cannot express.

-- 1) No double booking. Two ACTIVE bookings can never overlap on the same physical room, even under
--    concurrent requests. [checkIn, checkOut) is half-open, so a guest may arrive on the day another
--    leaves. Cancelled / checked-out / no-show bookings release the room automatically.
--    Keep the status list in sync with ACTIVE_ROOM_BOOKING_STATUSES in packages/shared.
--    (btree_gist is created by the earlier reservation migration.)
ALTER TABLE "room_bookings"
  ADD CONSTRAINT "room_booking_no_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    daterange("checkInDate", "checkOutDate", '[)') WITH &&
  )
  WHERE ("roomId" IS NOT NULL AND "bookingStatus" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN'));

ALTER TABLE "room_bookings"
  ADD CONSTRAINT "room_booking_checkout_after_checkin" CHECK ("checkOutDate" > "checkInDate");

-- 2) Room numbers and room-type slugs are unique per branch among non-deleted rows.
CREATE UNIQUE INDEX "rooms_branch_number_active_key"
  ON "rooms" ("branchId", "roomNumber")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "room_types_branch_slug_active_key"
  ON "room_types" ("branchId", "slug")
  WHERE "deletedAt" IS NULL;
