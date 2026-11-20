# Cashier, bills & payments (API v2)

Once a waiter requests the bill (or an order is fully served) the cashier raises a **bill**, applies any
discount, takes one or more **payments**, and the order completes with a **receipt**. Money handling is
deliberately conservative: amounts are computed on the server, in integer cents, and every state change is a
transaction under a per-bill lock.

## Endpoints

| Method & path                                | Who                                  | Notes                                                                               |
| -------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `GET /bills/queue?branchId`                  | `payments:process`                   | Served / bill-requested orders not yet paid, oldest request first                   |
| `POST /bills`                                | `payments:process`                   | `{ orderId }` — raises the bill; idempotent (returns the existing one)              |
| `GET /bills/:id`                             | `payments:process`                   | Lines, totals, payments, refunds, `receiptId`                                       |
| `PATCH /bills/:id/discount`                  | `payments:process`                   | Cashiers up to the configured limit (default 10%); larger needs `payments:discount` |
| `POST /bills/:id/payments`                   | `payments:process`                   | One payment (part or all of the balance). Split bills are several of these          |
| `GET /payments?from&to&method&branchId`      | `payments:process`                   | History; defaults to today in the branch timezone. Cashiers see their own           |
| `GET /payments/summary?scope`                | `payments:process`                   | Today's takings by method. `scope=branch` for managers / owners                     |
| `POST /payments/:id/refund`                  | `payments:refund`                    | Owner and cashier only. A reason is mandatory                                       |
| `GET /receipts/:id`, `GET /receipts/:id/pdf` | `payments:process`                   | The immutable receipt, as JSON or a PDF                                             |
| `GET /folios/:bookingId`                     | `payments:process` or `rooms:manage` | Restaurant charges posted to a guest's room                                         |

Waiters and kitchen staff hold none of these permissions: they never see money beyond the order subtotal
on their own screens.

## Calculation

`calculateBill` in `packages/shared` (unit-tested, used by the API and the web app):

```
net      = subtotal − discount            (discount never exceeds the subtotal)
service  = net × service charge %
tax      = (net + service) × tax %
total    = net + service + tax
```

Each step is rounded to whole cents. The service-charge and tax rates are read from company settings **when
the bill is raised and snapshotted on it**, so a later rate change never alters an existing bill. Until the
first payment, an unpaid bill follows its order's subtotal, so a cancelled dish is never charged.

## Taking payment

- Methods: cash, credit card, debit card, mobile payment, bank transfer, room charge. A seventh, loyalty points, is created only by `POST /bills/:id/redeem` and is rejected by this endpoint.
- `amount` is the part of the bill this payment settles and may not exceed the balance (`OVERPAYMENT`).
  Cash may carry `tendered` ≥ `amount`; the change is computed and stored. Other methods may carry a
  `reference` (card approval code, transfer id).
- **Split bills:** equal split, split by dishes (a proportional share including service and tax) or a custom
  amount all reduce to "several payments on one bill". The split helpers (`splitEqually`, `shareOfBill`) are
  shared and tested; the cashier still takes each payment with its own method.
- **Room charge** needs a room-service order for a guest who is still checked in; the payment is posted to
  that booking (`ROOM_CHARGE_UNAVAILABLE` otherwise). `GET /folios/:bookingId` lists the charges, net of
  refunds, for the final bill at check-out.
- Gateways plug in behind `PaymentProvider` (`payment.providers.ts`). Today every method is recorded
  manually; credentials for a future gateway belong in environment variables, never in code.

When the balance reaches zero, in the same transaction: the bill becomes `PAID`; the order goes
`PAID → COMPLETED` (both recorded in its history); a **receipt** is issued; and the table moves to
`CLEANING` if that was its last open order. A 100% discount (managers) settles the bill immediately with no
payment.

### Guarantees

- Two cashiers paying at once cannot double-charge: exactly one succeeds, the rest get `409`
  (`OVERPAYMENT` / `BILL_CLOSED`) — covered by a concurrency test.
- Bill and receipt numbers (`B-YYYYMMDD-NNN`, `R-YYYYMMDD-NNN`) are unique per branch under concurrency.
- Once money has been taken the order is frozen (`ORDER_HAS_PAYMENTS`): dishes cannot be added or cancelled
  and the order cannot be voided until the payments are refunded. Voiding an unpaid order voids its bill.
- A discount is locked after the first payment.
- Financial rows are never deleted by application code; refunds are new rows.

## Refunds (foundation)

A refund targets one payment and cannot exceed what remains of it (`REFUND_EXCEEDS_PAYMENT`). The bill keeps
a running `refundedAmount`; when everything paid has been refunded the bill is `REFUNDED` and the order
`REFUNDED`. The receipt body is never edited — its refunded total is read live. Refunding a room charge takes
it back off the folio. Refunds do not move money anywhere automatically; they record that the cashier
returned it.

## Receipts

Issued once, as a snapshot (branch, items, tax, discount, service charge, payments, cashier, footer from
settings) so later menu or rate changes never rewrite a printed receipt. The PDF is generated server-side by
a small dependency-free writer (`pdf.ts`) in an 80 mm thermal layout, and downloaded through the
authenticated API. On screen, the receipt page prints on its own.

## Real-time

`payment:changed` (ids and status only) joins `order:changed` on the `branch:<id>` room. The cashier's queue,
the bill screen and the waiter's order page all refetch on these events, so the waiter sees the order become
**Completed** without reloading.

## Known gaps

- Customers see their own invoices only for bills the cashier attached their account to (see [customers.md](customers.md)).
- No email/SMS "send receipt" — download and print only.
- No cash-drawer reconciliation or shift close-out; "shift" totals are the cashier's day in the branch timezone.
- Refunds are not approved by a second person; the role matrix (owner and cashier) and the mandatory reason
  are the controls.
- A gateway integration (card capture) is a seam only.

## Emailing a receipt

`POST /receipts/:id/email` with `{ "to": "guest@example.com" }` (optional when the bill has a
customer attached) sends the receipt text and a PDF. Needs `payments:process` and access to the
receipt's branch. Configure `SMTP_URL` / `MAIL_FROM` (see [environment](../environment.md)); in
development mail is logged rather than sent, and in production an unconfigured server answers 503.
