import { PAYMENT_METHOD_LABELS, type ReceiptDto } from "@smartdine/shared";

import { formatDateTime, formatMoney } from "@/utils/format";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong ? "flex justify-between gap-2 text-base font-semibold" : "flex justify-between gap-2"
      }
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The receipt as an on-screen, printable sheet. */
export function ReceiptView({ receipt }: { receipt: ReceiptDto }) {
  const money = (n: number) => formatMoney(n, receipt.currency);
  return (
    <article
      id="receipt"
      aria-label={`Receipt ${receipt.receiptNumber}`}
      className="mx-auto w-full max-w-sm space-y-3 rounded-lg border border-border bg-surface p-6 font-mono text-sm shadow-sm"
    >
      <header className="space-y-0.5 text-center">
        <h2 className="font-display text-xl font-semibold tracking-wide uppercase">
          {receipt.company}
        </h2>
        <p>{receipt.branch.name}</p>
        {receipt.branch.address && <p className="text-xs">{receipt.branch.address}</p>}
        {receipt.branch.phone && <p className="text-xs">{receipt.branch.phone}</p>}
      </header>
      <hr className="border-dashed border-border" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt>Receipt</dt>
        <dd className="text-right">{receipt.receiptNumber}</dd>
        <dt>Bill</dt>
        <dd className="text-right">{receipt.billNumber}</dd>
        <dt>Order</dt>
        <dd className="text-right">{receipt.orderNumber}</dd>
        <dt>{receipt.location}</dt>
        <dd className="text-right">{formatDateTime(receipt.issuedAt, receipt.timezone)}</dd>
        <dt>Cashier</dt>
        <dd className="text-right">{receipt.cashierName}</dd>
        <dt>Waiter</dt>
        <dd className="text-right">{receipt.waiterName}</dd>
        {receipt.guestName && (
          <>
            <dt>Guest</dt>
            <dd className="text-right">{receipt.guestName}</dd>
          </>
        )}
      </dl>
      <hr className="border-dashed border-border" />
      <ul className="space-y-1">
        {receipt.lines.map((l, i) => (
          <li key={i}>
            <p className="flex justify-between gap-2">
              <span>
                {l.quantity} × {l.name}
              </span>
              <span>{money(l.lineTotal)}</span>
            </p>
            {l.modifiers.length > 0 && (
              <p className="pl-4 text-xs text-muted-foreground">+ {l.modifiers.join(", ")}</p>
            )}
          </li>
        ))}
      </ul>
      <hr className="border-dashed border-border" />
      <dl className="space-y-0.5">
        <Row label="Subtotal" value={money(receipt.subtotal)} />
        {receipt.discountAmount > 0 && (
          <Row label="Discount" value={`−${money(receipt.discountAmount)}`} />
        )}
        {receipt.serviceChargeAmount > 0 && (
          <Row
            label={`Service charge ${receipt.serviceChargePercent}%`}
            value={money(receipt.serviceChargeAmount)}
          />
        )}
        {receipt.taxAmount > 0 && (
          <Row label={`Tax ${receipt.taxPercent}%`} value={money(receipt.taxAmount)} />
        )}
        <Row label="Total" value={money(receipt.total)} strong />
      </dl>
      <hr className="border-dashed border-border" />
      <ul className="space-y-0.5">
        {receipt.payments.map((p, i) => (
          <li key={i}>
            <dl>
              <Row label={PAYMENT_METHOD_LABELS[p.method]} value={money(p.amount)} />
            </dl>
            {p.tendered !== null && (
              <p className="flex justify-between pl-3 text-xs">
                <span>Tendered</span>
                <span>{money(p.tendered)}</span>
              </p>
            )}
            {!!p.change && (
              <p className="flex justify-between pl-3 text-xs">
                <span>Change</span>
                <span>{money(p.change)}</span>
              </p>
            )}
            {p.reference && <p className="pl-3 text-xs">Ref: {p.reference}</p>}
          </li>
        ))}
      </ul>
      {receipt.refundedAmount > 0 && (
        <dl>
          <Row label="Refunded" value={`−${money(receipt.refundedAmount)}`} />
        </dl>
      )}
      {receipt.footer && (
        <p className="border-t border-dashed border-border pt-2 text-center text-xs">
          {receipt.footer}
        </p>
      )}
      <p className="text-center text-xs">Thank you for dining with us</p>
    </article>
  );
}
