# Public site, Menu & Reservations (API v2)

SmartDine V2 has **no QR ordering**. Customers browse a public menu; dine-in orders are created by
staff (Phase 6). Everything under "Public" below needs no login.

## Public endpoints (rate limited per IP)

| Method & path                                                                       | Notes                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /public/branches`                                                              | Non-closed branches (no manager details)                      |
| `GET /public/company`                                                               | Name, contact, currency, reservation duration / cancel window |
| `GET /public/private-rooms?branchId`                                                | Active private dining rooms                                   |
| `GET /public/gallery?branchId`                                                      | Dish and room photos                                          |
| `GET /categories`                                                                   | Visible menu categories                                       |
| `GET /menu?branchId&q&category&vegetarian&vegan&halal&spicy&featured&popular&isNew` | Categories + dishes. Cost data is never included              |
| `GET /menu/items/:slug?branchId`                                                    | Dish detail + up to 4 related dishes                          |
| `GET /menu/allergens`                                                               | Allergen list                                                 |
| `GET /reservations/availability?branchId&date&guests`                               | Bookable times with free dining areas                         |
| `GET /reservations/private/availability?roomId&date`                                | Room opening window and busy intervals                        |

Each dish carries `availability` (`AVAILABLE` / `SOLD_OUT` / `TEMPORARILY_UNAVAILABLE`), optional
`mealPeriods` (breakfast / lunch / dinner only) and a computed `isAvailableNow`.

## Menu management (staff)

| Method & path                                            | Permission          | Notes                                                                       |
| -------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `GET /menu/admin?branchId`                               | `menu:availability` | Every dish; `costPrice` only for `menu:manage`                              |
| `POST /menu/items`                                       | `menu:manage`       | Slug generated, unique per branch                                           |
| `PATCH /menu/items/:id`                                  | `menu:manage`       |                                                                             |
| `DELETE /menu/items/:id`                                 | `menu:manage`       | Soft delete                                                                 |
| `PATCH /menu/items/:id/availability`                     | `menu:availability` | Kitchen, manager, owner. Pushed live (`menu:item-updated`, never with cost) |
| `GET /categories/admin`, `POST/PATCH/DELETE /categories` | `menu:manage`       | `CATEGORY_NOT_EMPTY` blocks deleting a used category                        |

All URL fields (images, logos) accept **http(s) only**; `javascript:` and `data:` URLs are rejected.

## Reservations

| Method & path                                 | Who                   | Notes                                                             |
| --------------------------------------------- | --------------------- | ----------------------------------------------------------------- |
| `POST /reservations`                          | Customer              | Table booking; **confirmed instantly**                            |
| `POST /reservations/private`                  | Customer              | Private room; starts **PENDING** (needs staff approval + deposit) |
| `GET /reservations/mine`                      | Customer              | Own bookings only                                                 |
| `POST /reservations/:id/cancel`               | Customer (owner)      | Another customer's id returns `404`                               |
| `GET /reservations?branchId&date&status&type` | `reservations:manage` | A date needs a branch (it is a branch-local day)                  |
| `POST /reservations/staff`                    | `reservations:manage` | Phone / walk-in booking, optionally pinning a `tableId`           |
| `PATCH /reservations/:id/status`              | `reservations:manage` | Validated transitions below; emits `reservation:changed`          |

Browsing and availability are public; **confirming requires a customer account** (staff accounts
cannot book online). A customer can hold up to 5 upcoming reservations.

### Status workflow

```text
PENDING   → CONFIRMED | CANCELLED
CONFIRMED → CHECKED_IN | CANCELLED | NO_SHOW
CHECKED_IN→ SEATED | CANCELLED | NO_SHOW
SEATED    → COMPLETED          (and the table becomes OCCUPIED on the floor plan)
COMPLETED, CANCELLED, NO_SHOW are final
```

Updates are conditional on the status that was validated, so concurrent staff actions cannot skip steps.

### Rules

- **Time zones.** Dates and times are the branch's local wall-clock time (DST-safe); instants are stored in UTC.
- **Hours.** A day with no configured hours uses 09:00–22:00; an explicit `null` means closed. A close
  time at or before the open time means the venue closes after midnight.
- **Slots** are every 30 minutes and must end by closing time. Bookings need 30 minutes' notice and
  can be made up to 90 days ahead.
- **Duration** comes from company settings (`reservationDurationMinutes`, default 90). Private
  bookings choose 1–12 hours in 30-minute steps.
- **Table choice.** The system picks the smallest free table that fits the party (optionally within
  the chosen area), ignoring out-of-service tables and unavailable areas.
- **Cancellation.** Customers may cancel online until `cancellationWindowHours` before the start
  (`CANCELLATION_WINDOW_PASSED` afterwards). Staff can cancel at any time.

### Double-booking protection

Correctness does not depend on application checks alone. PostgreSQL exclusion constraints
(`reservation_table_no_overlap`, `reservation_room_no_overlap`, migration
`20261103120000_reservation_constraints`) reject any two **active** (`PENDING`, `CONFIRMED`,
`CHECKED_IN`, `SEATED`) reservations that overlap on the same table or room, even for simultaneous
requests. A request that loses such a race moves on to the next candidate table; if none remain it
fails with `RESERVATION_CONFLICT` (409). Cancelled, completed and no-show bookings release the slot
automatically. Back-to-back bookings (one ending exactly when the next starts) are allowed.
Each booking transaction also takes a per-table / per-room advisory lock so contenders queue and the
loser fails fast instead of waiting for the deadlock detector (see [rooms.md](rooms.md#no-double-booking)).
Integration tests fire concurrent requests and assert exactly one winner.

Other error codes: `BRANCH_NOT_OPEN`, `BRANCH_CLOSED`, `ROOM_CLOSED`, `TOO_MANY_RESERVATIONS`,
`NOT_CANCELLABLE`, `INVALID_TRANSITION`, `VALIDATION_ERROR`.

## Real-time events (room `branch:<id>`)

| Event                 | Payload                                      |
| --------------------- | -------------------------------------------- |
| `menu:item-updated`   | `MenuItemDto` (no cost) or `{ id, deleted }` |
| `reservation:changed` | `ReservationDto`                             |
| `table:updated`       | `TableDto` (e.g. when a party is seated)     |

## Not in this phase

Promotions (Offers page shows an empty state), reviews / testimonials, loyalty, confirmation emails
and push notifications (Phase 8–9), image uploads (images are URLs), and online payment of deposits (Phase 7). Accommodation rooms are covered in [rooms.md](rooms.md).
