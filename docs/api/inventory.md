# Inventory, stock & suppliers (API v2)

Stock control for each branch: what is on hand, what is low or about to expire, and a complete audit trail
of every movement. Everything here needs `inventory:manage` (managers and owners). Floor staff, kitchen and
cashiers have no access, and a manager only reaches their own branch.

## Endpoints

| Method & path                                              | Notes                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /inventory/items?branchId&status&category&q`          | Stock list with a computed `status`; `q` searches name and SKU                      |
| `GET /inventory/summary?branchId`                          | Item count, low / out / expiring counts and total stock value                       |
| `POST /inventory/items`                                    | Opening `quantity` is recorded as the first purchase                                |
| `PATCH /inventory/items/:id`                               | Details only — quantity is never edited directly                                    |
| `DELETE /inventory/items/:id`                              | Archives the item; its history is kept                                              |
| `POST /inventory/items/:id/movements`                      | Records one stock movement (below)                                                  |
| `GET /inventory/transactions?branchId&itemId&type&from&to` | History, newest first; with no dates, the most recent activity                      |
| `GET/POST/PATCH/DELETE /suppliers`                         | Company-wide supplier profiles; deleting archives and detaches the supplier's items |

## Status

One status per item, most urgent first (`inventoryStatus` in `packages/shared`, unit-tested):

1. `OUT_OF_STOCK` — nothing left
2. `EXPIRING` — expires within 7 days, or already has
3. `LOW_STOCK` — at or below the reorder level
4. `IN_STOCK`

Dates are compared in the branch's own timezone.

## Movements

| Type         | Effect on quantity    | Body                                                              |
| ------------ | --------------------- | ----------------------------------------------------------------- |
| `PURCHASE`   | `+` quantity          | `quantity`, optional `unitCost` (becomes the item's current cost) |
| `USE`        | `−` quantity          | `quantity`                                                        |
| `WASTE`      | `−` quantity          | `quantity`                                                        |
| `RETURN`     | `−` quantity          | `quantity` — goods **returned to a supplier**                     |
| `ADJUSTMENT` | to the counted amount | `countedQuantity` — the system works out the difference           |
| `TRANSFER`   | `−` here, `+` there   | `quantity`, `toBranchId` (owners only)                            |

Every movement writes one append-only `StockTransaction` with the signed change, the balance after it, the
user, an optional reference and note. Stock can never go negative (`INSUFFICIENT_STOCK`).

### Guarantees

- The item row is locked for each movement, so two people using the same ingredient at once cannot both
  read the old quantity: one succeeds, the other gets `409`. The audit trail always adds up to the quantity
  on hand (checked by a concurrency test).
- A transfer locks both items in a fixed order (no deadlocks), writes both transactions with
  cross-referencing `counterpartId`s, and creates the item empty in the destination branch if its SKU is
  new there.
- SKUs are unique per branch, case-insensitively (stored upper-case). An archived item keeps its SKU.

## Known gaps

- Stock isn't deducted automatically when dishes are ordered: there are no recipes linking menu items to
  ingredients yet. Usage is recorded by hand.
- No low-stock notification yet — the Stock page and summary show it; alerts arrive with the notification
  centre in Phase 9.
- Reorder levels are per item, with no purchase-order workflow.
