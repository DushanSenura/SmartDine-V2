# Analytics, reports, notifications, audit & search (API v2)

## Dashboards

`GET /analytics/dashboard?branchId&days` — owners and managers (`reports:view`), `days` 1–90 (default 14).

A manager always sees their own branch. An owner sees one branch (`branchId`) or, with none chosen, the
whole company, which adds a `branchComparison`. Everything is bucketed by the **branch's own calendar day
and hour** (the company's, for an all-branches view), so "today" means the same thing on every card.

| Figure               | Definition                                                                             |
| -------------------- | -------------------------------------------------------------------------------------- |
| Revenue              | Money actually collected, **net of refunds**. Loyalty points are a tender, not takings |
| Orders               | Orders created in the period, excluding drafts, cancelled and voided                   |
| Average order value  | Revenue ÷ bills paid                                                                   |
| Active tables        | Tables occupied, ordering, waiting for food, dining or awaiting payment                |
| Room occupancy       | Rooms currently occupied ÷ all rooms (trend: stays covering each night ÷ rooms)        |
| Kitchen average time | Sent to the kitchen → dish ready, for dishes finished today                            |
| Customers today      | Distinct customers attached to bills paid today (anonymous diners aren't counted)      |
| Low stock items      | Items low or out of stock                                                              |

Series: revenue and orders per day, sales by category and popular dishes (completed orders), payment-method
mix, hourly sales, occupancy per night and reservations by weekday. The web charts are plain SVG/HTML, each
with a "View as table" twin of the same numbers.

## Reports

`GET /reports/:type?branchId&from&to&group&format` — `reports:view`. `format` is `json` (default), `csv` or
`pdf`. Dates default to the last 30 days; ranges of a year or more are refused. Every report has the same
shape (`columns`, `rows`, `totals`), which is what the screen, the CSV and the PDF all render.

Types: `sales` (group by day / week / month), `orders`, `menu-performance`, `employee-performance`,
`reservations`, `room-occupancy`, `room-revenue`, `payments`, `refunds`, `inventory` (stock as of now),
`waste`, `loyalty` and `branch-performance`.

- `branch-performance` is **owner-only** and always company-wide, whichever branch is selected.
- An owner looking at every branch gets an extra **Branch** column on listing reports.
- Listing reports stop at 5,000 rows and say so (`truncated`); narrow the dates to see everything.
- **CSV** opens cleanly in Excel (UTF-8 with a BOM). Any text cell starting with `=`, `+`, `-` or `@` is
  prefixed with an apostrophe so a guest's name or a note can't run as a formula; real numbers are untouched.
- **PDF** is a dependency-free A4-landscape table (standard Courier), paginated with the header repeated.
- The **loyalty** report is company-wide (customers don't belong to a branch).

## Notifications

`GET /notifications?unread&limit`, `POST /notifications/:id/read`, `POST /notifications/read-all` — every
signed-in user, staff and customers alike, always their own (someone else's id is `404`). New ones are pushed
live as `notification:new` to the user's own socket room; nothing polls.

| Who                | Hears about                                                                      |
| ------------------ | -------------------------------------------------------------------------------- |
| Waiters, managers  | An order waiting for approval; a guest arriving (waiters)                        |
| Kitchen            | A new approved order; more dishes added to one in progress                       |
| The order's waiter | Dishes ready to serve                                                            |
| Cashier            | A table asking for the bill                                                      |
| Managers, owners   | Stock newly running low or out; a cancelled reservation; a room into maintenance |
| The customer       | Table confirmed; room booked; payment received (links to the receipt)            |

The person who caused an event is never told about it, and staff only hear about their own branch (owners
hear everything relevant). Notifications are best-effort: a failure to send one is logged and never undoes
the action that triggered it. The bell groups them by topic, deep-links to the page, and marks read / all read.

## Audit log

`GET /audit?from&to&entity&action&userId&page` — **owner only** (`audit:view`); read-only, 50 per page.

Each entry stores the actor (id, **name and role copied in**, so it survives the account changing), the
action, entity and id, the previous and new values (only the fields that changed), the client IP and the
time. Recorded: menu price changes, staff created / updated / deleted, branch changes, refunds, discounts,
voided orders, cancelled reservations and bookings, settings changes, promotions, manual loyalty
adjustments, stock waste and counts, and review moderation. Passwords are never written (a reset is noted as
`passwordReset: true`). A refund's entry is written **in the same transaction** as the refund; the rest are
written right after the action commits, and a failed write is logged rather than undoing the action.

## Search

`GET /search?q&branchId` — any staff role, 2–80 characters. One request searches orders, reservations, room
bookings, customers, menu items, tables, staff and rooms, **but only the kinds the caller's role may open**
(the kitchen finds dishes, never orders or money; only managers find staff and customers) and only in the
caller's branch. Up to five results per kind, each with a deep link. `%` and `_` are matched literally.
The web app opens it with **Ctrl/Cmd + K**.

## Payment settings

Owners set, in Settings: the **cashier discount limit** (default 10%; promo codes are exempt) and the
**accepted payment methods**. A method that is switched off is refused with `PAYMENT_METHOD_DISABLED` and
removed from the till's method list. Changes are audited as a diff.

## Known gaps

- No **urgent-order** alert for tickets left waiting, and no reservation **reminders** (both need a
  background scheduler, which doesn't exist yet).
- No guest "needs assistance" request or staff-issue notifications.
- Reports aggregate in the application, not in SQL; fine at a restaurant's scale, to be revisited for far
  larger volumes.
- The audit log has no retention or export, and reads of sensitive data aren't logged.
- Notification preferences (muting a topic) aren't configurable.
