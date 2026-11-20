# Branches, Staff & Restaurant Setup (API v2)

All endpoints require a Bearer access token (see [auth.md](auth.md)) and use the standard response
envelope. Errors referenced below are `error.code` values.

## Branch isolation

Owners reach every branch. Every other staff role is confined to the branch on their account:

- **List endpoints** resolve the branch from the caller (an explicit `branchId` for another branch → `403`).
  Owners must pass `branchId` where a single branch is required.
- **Resource endpoints** (`/tables/:id`, `/private-dining/:id`, `/staff/:id` …) load the resource,
  then check its branch against the caller (`assertBranchAccess`) → `403`.
- Creating or reassigning a branch's manager updates that user's branch membership; the previous
  manager loses branch-scoped access.

The branch is read from the access token, so a reassignment takes effect on the user's next token
refresh (≤ 15 minutes by default); changing a staff member's role or branch revokes their sessions
immediately.

## Endpoints

| Method & path                                                  | Permission                      | Notes                                                      |
| -------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `GET /settings`                                                | Owner, Manager                  | Company profile + tax / service charge / booking rules     |
| `PUT /settings`                                                | `settings:manage`               | `{ company?, settings? }`                                  |
| `GET /branches`                                                | any staff                       | Own branch (owners: all)                                   |
| `GET /branches/:id`                                            | any staff                       | `403` for other branches                                   |
| `POST /branches`                                               | `branches:manage`               | `BRANCH_CODE_TAKEN` on duplicate code                      |
| `PATCH /branches/:id`                                          | `branches:manage`               | Opening hours, status, manager …                           |
| `DELETE /branches/:id`                                         | `branches:manage`               | Soft delete (status → CLOSED)                              |
| `GET/POST /staff`, `GET/PATCH/DELETE /staff/:id`               | `staff:manage`                  | Account + HR profile; role limits below; delete is soft    |
| `GET/POST /shifts`, `PATCH/DELETE /shifts/:id`                 | `staff:manage`                  | Company-wide shift types; `SHIFT_IN_USE` blocks deletion   |
| `GET /shifts/schedule`                                         | `staff:manage`                  | `branchId`, `from`, `to` (max 62 days)                     |
| `PUT /shifts/schedule`                                         | `staff:manage`                  | One entry per person per day: a shift **or** a day off     |
| `DELETE /shifts/schedule/:id`                                  | `staff:manage`                  |                                                            |
| `GET /shifts/schedule/me`                                      | any staff                       | Own schedule                                               |
| `POST /shifts/attendance/clock-in`                             | any staff with a branch         | `ALREADY_CLOCKED_IN`                                       |
| `POST /shifts/attendance/clock-out`                            | any staff                       | `NOT_CLOCKED_IN`                                           |
| `GET /shifts/attendance`                                       | `staff:manage`                  | Daily roster for a branch                                  |
| `GET/POST /tables/areas`, `PATCH/DELETE /tables/areas/:id`     | `tables:view` / `tables:manage` | Floors / dining zones; `AREA_NOT_EMPTY`                    |
| `GET /tables`                                                  | `tables:view`                   | Live tables of a branch                                    |
| `POST /tables`, `PATCH/DELETE /tables/:id`                     | `tables:manage`                 | `TABLE_NUMBER_TAKEN` (unique per branch among live tables) |
| `PATCH /tables/:id/status`                                     | `tables:status`                 | Owner, Manager, Waiter                                     |
| `PUT /tables/layout`                                           | `tables:manage`                 | Bulk positions / sizes after drag & resize                 |
| `POST /tables/assign-waiter`                                   | `tables:manage`                 | Waiter must be an active WAITER of the same branch         |
| `GET/POST /private-dining`, `PATCH/DELETE /private-dining/:id` | `tables:view` / `tables:manage` | Guest limits validated                                     |

**Role assignment** (`ASSIGNABLE_ROLES` in `packages/shared`): an Owner may create any staff role; a
Manager may create and manage Waiter, Kitchen and Cashier staff **of their own branch** only.

## Real-time

Events (names in `SocketEvents`, `packages/shared`) are emitted to the room `branch:<id>`:

| Event                  | Payload            | When                                                                 |
| ---------------------- | ------------------ | -------------------------------------------------------------------- |
| `table:created`        | `TableDto`         | Table added                                                          |
| `table:updated`        | `TableDto`         | Table edited or status changed                                       |
| `table:deleted`        | `{ id, branchId }` | Table removed                                                        |
| `floor:layout-changed` | `{ branchId }`     | Areas changed, bulk layout save, waiter assignment — clients refetch |

Staff are placed in their own branch's room on connect. Owners (no home branch) subscribe with the
client event `branch:join <branchId>` (and `branch:leave`); the server ignores joins for branches the
caller may not access, and re-sends are required after every reconnect because rooms do not survive one.
