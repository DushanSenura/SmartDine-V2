# Accommodation: rooms, bookings & housekeeping (API v2)

Guest rooms are separate from restaurant tables and private dining rooms. A **room type** (Standard,
Deluxe…) is what is sold; a **room** is a physical unit (101, 102…) of one type.

## Endpoints

| Method & path                                                               | Who                                              | Notes                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `GET /room-types?branchId`                                                  | Public                                           | Active types that have rooms                                      |
| `GET /room-types/by-slug/:slug?branchId`                                    | Public                                           | Room details                                                      |
| `GET /room-extras?branchId`                                                 | Public                                           | Active extras only                                                |
| `GET /room-bookings/availability?branchId&checkIn&checkOut&adults&children` | Public                                           | Free types with a full price quote                                |
| `POST /room-bookings`                                                       | Customer                                         | Books and assigns a room; **confirmed instantly**                 |
| `GET /room-bookings/mine`                                                   | Customer                                         | Own stays only                                                    |
| `POST /room-bookings/:id/cancel`                                            | Customer (owner)                                 | Someone else's id returns `404`                                   |
| `GET /room-bookings?branchId&status&from&to`                                | `rooms:manage`                                   | Defaults to stays that have not ended                             |
| `POST /room-bookings/staff`                                                 | `rooms:manage`                                   | Phone / walk-in; may pin a `roomId`                               |
| `PATCH /room-bookings/:id/status`                                           | `rooms:manage`                                   | Confirm, check in, check out, no-show, cancel                     |
| `GET /room-bookings/:id/free-rooms`, `PATCH /room-bookings/:id/room`        | `rooms:manage`                                   | Move a not-yet-arrived booking to another room of the booked type |
| `GET/POST/PATCH/DELETE /room-types…`                                        | `rooms:manage`                                   | `/room-types/admin` includes inactive types and room counts       |
| `GET /rooms`, `GET /rooms/overview`                                         | `rooms:manage` (list also `housekeeping:update`) | Inventory, occupancy, arrivals / departures                       |
| `POST/PATCH/DELETE /rooms…`, `PATCH /rooms/:id/status`                      | `rooms:manage`                                   | Manual statuses: available, maintenance, out of service           |
| `GET/POST/PATCH/DELETE /room-extras…`                                       | `rooms:manage`                                   | `/room-extras/admin` includes inactive extras                     |
| `GET /housekeeping/tasks`, `PATCH /housekeeping/tasks/:id`                  | `housekeeping:update` or `rooms:manage`          | Cleaning tasks                                                    |
| `PATCH /housekeeping/rooms/:id`                                             | `housekeeping:update` or `rooms:manage`          | Set CLEAN / DIRTY / CLEANING / INSPECTION / MAINTENANCE           |

Floor staff (waiters) hold `housekeeping:update`; only owners and managers run the front desk.

## Pricing

Computed by one pure module shared by the API and the web app (`packages/shared`, unit-tested), so the
price shown in the booking review is exactly what the server charges. The server always prices from
the database — extras and rates sent by a client are ignored.

- Nightly rate: `basePrice`, or `weekendPrice` for **Friday and Saturday nights**.
- Extras are charged per stay, per night or per guest.
- Tax is `taxRatePercent` from company settings on rooms + extras; deposit is `roomDepositPercent` of the total.
- Money is rounded to 2 decimals at each step. Booked extras are snapshotted on the booking, so later
  price edits never change past bookings.

## Rules

- Dates are calendar dates in the branch's timezone. Stays are 1–30 nights, up to 365 days ahead, never in the past.
- Party size must fit the room type (`maximumGuests`). A customer can hold 5 upcoming stays.
- **Free cancellation** closes `cancellationWindowHours` before the check-in time (default 24 h before 14:00).
  Staff can cancel at any time.
- Rooms in `MAINTENANCE` / `OUT_OF_SERVICE` are not offered; a room with upcoming bookings cannot be
  taken out of service, and an occupied room cannot be changed or deleted.

## Stay workflow

```text
PENDING   → CONFIRMED | CANCELLED
CONFIRMED → CHECKED_IN | CANCELLED | NO_SHOW
CHECKED_IN→ CHECKED_OUT
CHECKED_OUT, CANCELLED, NO_SHOW are final
```

- **Check-in** needs a room that is not occupied / out of service and is **CLEAN**, and today within the stay's
  dates. The room becomes `OCCUPIED`.
- **Check-out** puts the room in `CLEANING` with housekeeping `DIRTY` and opens a cleaning task. The room is not
  sold or used again until it is marked clean, which returns it to `AVAILABLE` and closes its tasks.
- Customer bookings are assigned a physical room when created; staff may reassign before arrival.
- The deposit is recorded (`paymentStatus: UNPAID`) but not collected online; payments arrive in Phase 7.

## No double booking

Every booking holds a physical room, and PostgreSQL enforces the rest: the exclusion constraint
`room_booking_no_overlap` (migration `20261104090000_room_constraints`) rejects any two **active**
bookings whose `[checkIn, checkOut)` ranges overlap on the same room. Stays are half-open, so a guest
may arrive the day another leaves.

To stay fast and clean under load, each booking transaction first takes a per-room advisory lock
(`withResourceLock`). Without it, two in-flight overlapping inserts wait on each other until
PostgreSQL's deadlock detector (≥ 1 s) aborts one — we observed this in testing. With it, contenders
queue and the loser gets an immediate `ROOM_UNAVAILABLE` (409). A request that still loses a
deadlock or serialization race (`40P01` / `40001`) is retried automatically. The same lock protects
table and private-room reservations. Tests fire simultaneous requests for the last room and assert
exactly one winner, repeatedly.

Error codes: `ROOM_UNAVAILABLE`, `ROOM_NOT_READY`, `NO_ROOM_ASSIGNED`, `TOO_EARLY`, `STAY_OVER`,
`ROOM_HAS_BOOKINGS`, `ROOM_OCCUPIED`, `ROOM_NUMBER_TAKEN`, `ROOM_TYPE_IN_USE`, `TOO_MANY_BOOKINGS`,
`CANCELLATION_WINDOW_PASSED`, `NOT_CANCELLABLE`, `INVALID_TRANSITION`, `BRANCH_NOT_OPEN`.

## Real-time

`room-booking:changed` (`RoomBookingDto`) and `room:updated` (`{ id }`) are emitted to the room
`branch:<id>`; staff screens refetch on either.

## Not in this phase

Online deposit payment and the final room bill (Phase 7), room-service orders charged to a room
(Phase 6), occupancy and revenue reports (Phase 9 builds on `GET /rooms/overview`), confirmation
emails, and image uploads (images are URLs).
