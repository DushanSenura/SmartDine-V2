# Orders, waiter service & kitchen (API v2)

There is no QR ordering. **Staff create every order**: a waiter (or manager) opens a table's order, or a
room-service order for a checked-in guest, adds dishes, and sends it to the kitchen. The kitchen works it
dish by dish and the waiter is told when food is ready.

## Endpoints

| Method & path                               | Who               | Notes                                                                       |
| ------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| `GET /orders?branchId&scope&tableId&status` | `orders:view`     | `scope=active` (default) or `history`                                       |
| `POST /orders`                              | `orders:create`   | `DINE_IN` needs `tableId`; `ROOM_SERVICE` needs `roomId`. Creates a `DRAFT` |
| `GET /orders/:id`                           | `orders:view`     | Includes the audit history                                                  |
| `PATCH /orders/:id`                         | `orders:create`   | Guest, party size, kitchen instructions (draft / pending approval only)     |
| `POST /orders/:id/items`                    | `orders:create`   | Draft; or, once in the kitchen, approvers only — added as a **new round**   |
| `PATCH /orders/:id/items/:itemId`           | `orders:create`   | Draft quantity / notes                                                      |
| `POST /orders/:id/items/:itemId/cancel`     | `orders:create`   | Order-takers: dishes not yet started. Managers / owners: any unserved dish  |
| `POST /orders/:id/submit`                   | `orders:create`   | `DRAFT` → `PENDING_APPROVAL`                                                |
| `POST /orders/:id/approve`                  | `orders:approve`  | `DRAFT` / `PENDING_APPROVAL` → `SENT_TO_KITCHEN`                            |
| `POST /orders/:id/reject`                   | `orders:approve`  | Back to `DRAFT` with a reason                                               |
| `POST /orders/:id/serve`                    | `orders:serve`    | Marks ready dishes served (`itemIds` optional = all ready dishes)           |
| `POST /orders/:id/request-payment`          | `orders:serve`    | Only once every dish is served                                              |
| `POST /orders/:id/cancel`                   | `orders:create`   | `CANCELLED` before the kitchen starts; managers / owners `VOID` after       |
| `GET /kitchen/tickets?branchId&station`     | `kitchen:operate` | Open tickets, oldest first. **No prices**                                   |
| `PATCH /kitchen/items/:id/status`           | `kitchen:operate` | `PREPARING` (start, or recall a ready dish) / `PREPARED`                    |
| `POST /kitchen/orders/:id/ready`            | `kitchen:operate` | Marks every unfinished dish ready (optionally for one `station`)            |

Kitchen staff hold `kitchen:operate` and `menu:availability` but **not** `orders:view`, so they cannot
open order pages or see money. Managers and owners hold both.

## Workflow

```
DRAFT → PENDING_APPROVAL → SENT_TO_KITCHEN → PREPARING → PARTIALLY_READY → READY_TO_SERVE
      ↘ (approvers skip approval)                                       → PARTIALLY_SERVED → SERVED
                                                                                           → PAYMENT_REQUESTED
```

After `SENT_TO_KITCHEN` the order status is **derived** from its dishes (`deriveOrderStatus` in
`packages/shared`): all served → `SERVED`; any served → `PARTIALLY_SERVED`; all prepared →
`READY_TO_SERVE`; any prepared → `PARTIALLY_READY`; any started → `PREPARING`. It is recomputed inside the
same transaction as every dish change, so it can never disagree with the dishes.

After `PAYMENT_REQUESTED` the cashier takes over: paying the bill moves the order `PAID → COMPLETED`, and a full refund makes it `REFUNDED` (see [payments.md](payments.md)). Once money has been taken the order is frozen.

## Rules

- Dishes are **snapshotted** (name, price, station, allergens, modifiers) when added; later menu edits do
  not change open orders. The server always prices from the database.
- A dish must be available now (availability and meal period). Modifiers must belong to the dish and be active.
- Order numbers are `YYYYMMDD-NNN`, unique per branch, allocated under a per-branch advisory lock.
- Room service requires a `CHECKED_IN` booking in that room (`ROOM_NOT_OCCUPIED`).
- A table that is out of service cannot take an order (`TABLE_OUT_OF_SERVICE`).
- At most 60 dishes per order, 50 of one dish.
- Every state change is a transaction and is recorded in the order history with who did it and why.
- Kitchen and serve actions are safe under concurrency: when several requests race to make the same
  transition, exactly one succeeds and the others get `409 Conflict`.

## Table status sync

An order moves its table: `ORDERING` (draft / pending) → `WAITING_FOR_FOOD` (in the kitchen) →
`DINING` (served) → `PAYMENT_PENDING` (bill requested); a table with an open order never falls below
`OCCUPIED`. `CLEANING` and `OUT_OF_SERVICE` are never overridden.

## Real-time

One event, `order:changed`, is emitted to the `branch:<id>` room after each committed change. It carries
**ids only** (order, table, status), never prices or dish details. Clients refetch through their own
authorised endpoints, so the kitchen never receives money data even over sockets. The web app also
refetches on socket reconnect, so a dropped connection does not leave a stale board.

## Kitchen display

The KDS (`/app/kitchen`) groups dishes into tickets per order, filters by station, and shows an elapsed
timer per ticket recomputed every second from `sentAt`. Priority escalates at 10 minutes (attention) and 20
minutes (urgent) and is shown as an icon **and** a label, never colour alone. Dishes added in a later round
are tagged "Added later". A full-screen toggle is provided.

## Known gaps (later phases)

- No notification centre or audible chime yet (Phase 9); live badges and the dashboard are the signal.
- Guest "service request" buttons are not implemented.

## Guest service requests

Staff log what a guest at a table asked for (water, cutlery, assistance, the bill…) so the
table's waiter sees it at once. Requires `orders:serve` (waiters, managers, owners) and the
branch of the table.

| Method | Path                              | Notes                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------- |
| GET    | `/service-requests?status=OPEN`   | Open (default) or `RESOLVED` requests for the branch, oldest first.   |
| POST   | `/service-requests`               | `{ tableId, type, note? }`. A repeat of an open request is a no-op.   |
| POST   | `/service-requests/:id/resolve`   | Marks it done. Idempotent.                                            |

Creating one sends a `SERVICE_REQUESTED` notification (to the table's assigned waiter, or all
waiters and managers if none) and a `service-request:changed` socket event to the branch.

## Customer table ordering

Signed-in customers (role `CUSTOMER` only) can order from their table. The order goes straight to
the kitchen, belongs to a waiter, and reaches the cashier like any other table order.

| Method | Path                                                  | Purpose                                              |
| ------ | ----------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/table-orders/table?branchId&tableNumber`            | Check a table number exists (404 if not)             |
| GET    | `/table-orders/waiters?branchId`                      | Active waiters of the branch the guest may choose    |
| POST   | `/table-orders`                                       | Place the order (`branchId`, `tableNumber`, `items`) |
| GET    | `/table-orders/mine`                                  | The customer's own orders from the last 24 hours     |

Waiter assignment: the guest's `waiterId` if given (must be an active waiter of that branch), else
the table's assigned waiter, else the waiter with the fewest open orders. The order's `selfOrdered`
flag is true, and `placedByUserId` records the customer.

Notifications: the kitchen gets `ORDER_SENT_TO_KITCHEN`; the waiter and cashiers get
`TABLE_ORDER_PLACED` (managers too when the guest picked no waiter). Orders are rate-limited like
bookings. The web page is `/order`.
