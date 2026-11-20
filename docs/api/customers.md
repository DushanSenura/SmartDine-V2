# Customers, loyalty, promotions & reviews (API v2)

Customers are users with the `CUSTOMER` role. The CRM adds a profile, a loyalty account and history on top
of that account. Visits and spend are **computed** from paid bills and finished stays, never stored, so
they can't drift.

## Customers (CRM)

| Method & path                               | Who                                      | Notes                                                 |
| ------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `GET /customers?q&page`                     | `customers:manage`                       | Search name, email, phone; 25 per page (`meta.total`) |
| `GET/PATCH /customers/:id`                  | `customers:manage`                       | Profile, history, loyalty; staff-only `notes`         |
| `POST /customers/:id/loyalty`               | `customers:manage`                       | Adjust points by hand; a reason is required           |
| `GET /customers/lookup?q`                   | `payments:process` or `customers:manage` | Name, email, phone, points only — what the till needs |
| `GET/PATCH /customers/me`                   | the customer                             | Own profile; cannot see or set staff notes            |
| `GET /customers/me/loyalty`, `/me/invoices` | the customer                             | Points ledger; paid bills with receipts               |
| `GET /customers/me/receipts/:id[/pdf]`      | the customer                             | Own receipts only; anyone else's is `404`             |
| `GET/PUT/DELETE /favourites[/:menuItemId]`  | the customer                             | Saved dishes; idempotent                              |

- **Visit** = a paid bill or a checked-out stay. **Total spent** = what bills were paid net of refunds, plus
  stay totals. **Last visit** = the most recent of them.
- A bill is linked to a customer when the cashier attaches their account at the till. That is what gives the
  customer their invoice, loyalty points and review rights.
- Customers can edit their own preferences, allergies and birthday; **staff notes are never returned to the
  customer**.
- An update only changes the fields it sends. This is enforced for every update schema by a test that parses
  an empty body (a `.partial()` that kept `.default()`s would otherwise reset allergies, images, etc.).

## Loyalty

Configured by the owner in settings: `loyaltyEnabled`, `loyaltyCurrencyPerPoint` (e.g. LKR 100 = 1 point)
and `loyaltyPointValue` (what a point is worth when spent). Off by default.

- **Earn** when a bill with an attached customer settles: `floor(real money paid ÷ spend-per-point)`, times
  the best running multiplier. Points spent on the bill earn nothing.
- **Redeem** through `POST /bills/:id/redeem` — never the ordinary pay endpoint, which rejects
  `LOYALTY_POINTS`. Points convert to a `LOYALTY_POINTS` payment in the same transaction that deducts them.
- **Refund** of a points payment returns the points in proportion; a **full refund** of the bill takes
  back the points it earned (as far as the customer still has them).
- Every change is a `LoyaltyTransaction` with the balance after it. The account row is locked per posting,
  so two bills redeeming at once can't spend the same points twice (concurrency-tested).
- Points payments are listed by method but are **not** counted as money collected on the till summary.

## Promotions

| Type                                                | Effect                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `PERCENTAGE`, `FIXED`, `HAPPY_HOUR`                 | A promo **code** the cashier applies to a bill as its discount         |
| `LOYALTY_MULTIPLIER`                                | Scales points earned (automatic; may be limited to days and hours)     |
| `RESERVATION_OFFER`, `ROOM_OFFER`, `SEASONAL_OFFER` | **Shown to guests only** — they do not discount anything automatically |

Fields: name, description, code, type, value, start / end dates, minimum spend, usage limit, branches,
customers, days of week, start / end time, active. Managed through `GET/POST/PATCH/DELETE /promotions`
(`promotions:manage`); an owner manages all, a manager only those confined to their own branch. Deleting
archives a promotion and frees its code. `GET /public/offers?branchId` lists live, public offers without
codes, limits or customer lists.

Applying a code to a bill (`PUT /bills/:id/promo`, `DELETE` to remove):

- Checks active, dates, branch, customer restriction, minimum spend and the happy-hour window — all in the
  **branch's** timezone — and explains why a code can't be used.
- One code per bill; a new code replaces the old one. A promo code is pre-approved by management, so it is
  not held to the cashier's 10% discount limit; a hand-typed discount replaces the code.
- **Usage limits are exact.** The use is reserved with a single conditional `UPDATE`, so cashiers racing for
  the last use cannot both get it (tested). The use is given back when the code is removed or replaced,
  the bill is voided, or its customer no longer qualifies.
- A 100% code settles the bill immediately.

## Reviews

| Method & path                  | Who                | Notes                                                              |
| ------------------------------ | ------------------ | ------------------------------------------------------------------ |
| `GET /reviews/reviewable`      | the customer       | Paid bills and finished stays not yet reviewed                     |
| `POST /reviews`                | the customer       | `DINING` needs a paid bill of theirs; `STAY` a checked-out booking |
| `GET /reviews/mine`            | the customer       |                                                                    |
| `GET /reviews?branchId&status` | `customers:manage` | Branch-scoped; full author names                                   |
| `PATCH /reviews/:id`           | `customers:manage` | Hide / publish and/or reply                                        |
| `GET /public/reviews?branchId` | public             | Average, count and the latest published; names shown as "Ada L."   |

Every review is **verified**: tied to a real paid bill or finished stay, one review each (`ALREADY_REVIEWED`).
Hidden reviews leave the website and the average immediately.

## Known gaps

- Reservation, room and seasonal offers are display-only; nothing applies them to a room booking or
  reservation automatically.
- Promo codes discount whole bills only — there are no per-item or per-category "menu discounts" yet.
- Orders aren't linked to a customer when placed; the account is attached by the cashier at payment time, so
  visits that skip that step don't count toward history or points.
- Loyalty has no expiry or tiers.
- Allergies recorded on a customer profile are not shown to the kitchen automatically.
- Customer records are company-wide: any manager can open any customer (not limited to their branch).

## Reservation reminders

A background job (every `REMINDER_JOB_INTERVAL_MINUTES`, default 5) sends a
`RESERVATION_REMINDER` notification to the customer of each confirmed reservation that starts
within `RESERVATION_REMINDER_HOURS` (default 2). Each reservation is reminded once
(`reminderSentAt`), even if several API instances run the job.
