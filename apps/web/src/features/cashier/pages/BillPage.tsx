import {
  calculateChange,
  DISCOUNT_TYPES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  Permissions,
  type BillDto,
  type DiscountType,
  type PaymentDto,
  type PaymentMethod,
} from "@smartdine/shared";
import { ChevronLeft, FileText, Split } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { formatMoney, formatTime } from "@/utils/format";

import {
  useApplyDiscount,
  useBill,
  useLivePayments,
  usePayBill,
  useRefundPayment,
} from "../api/cashierQueries";
import { BillCustomerPanel } from "../components/BillCustomerPanel";
import { BillStatusBadge } from "../components/BillBadges";
import { SplitDialog } from "../components/SplitDialog";
import { downloadReceiptPdf } from "../utils/receiptFile";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function Totals({ bill }: { bill: BillDto }) {
  const money = (n: number) => formatMoney(n, bill.currency);
  const rows: [string, string][] = [["Subtotal", money(bill.subtotal)]];
  if (bill.discountAmount > 0) rows.push(["Discount", `−${money(bill.discountAmount)}`]);
  rows.push([`Service charge ${bill.serviceChargePercent}%`, money(bill.serviceChargeAmount)]);
  rows.push([`Tax ${bill.taxPercent}%`, money(bill.taxAmount)]);
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
        <dt>Total</dt>
        <dd>{money(bill.total)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Paid</dt>
        <dd>{money(bill.paidAmount)}</dd>
      </div>
      <div className="flex justify-between font-semibold">
        <dt>Balance</dt>
        <dd aria-label="Balance due">{money(bill.balance)}</dd>
      </div>
    </dl>
  );
}

function DiscountForm({ bill }: { bill: BillDto }) {
  const { can } = useAuth();
  const apply = useApplyDiscount();
  const [type, setType] = useState<DiscountType>(bill.discountType ?? "PERCENT");
  const [value, setValue] = useState(bill.discountValue ? String(bill.discountValue) : "");
  const [reason, setReason] = useState(bill.discountReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const limited = !can(Permissions.PAYMENTS_DISCOUNT);

  return (
    <form
      aria-label="Discount"
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await apply.mutateAsync({
            id: bill.id,
            input: { type, value: Number(value) || 0, reason: reason.trim() || undefined },
          });
        } catch (err) {
          setError(errorText(err, "Couldn't apply the discount."));
        }
      }}
    >
      <h2 className="text-sm font-semibold">Discount</h2>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as DiscountType)}
          options={DISCOUNT_TYPES.map((t) => ({
            value: t,
            label: t === "PERCENT" ? "Percent (%)" : `Amount (${bill.currency})`,
          }))}
        />
        <TextField
          label="Discount value"
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <TextField
        label="Discount reason"
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
        hint={
          limited
            ? `Cashiers can discount up to ${bill.rules.discountLimitPercent}%. Larger discounts need a manager.`
            : undefined
        }
      />
      <FormError message={error} />
      <Button type="submit" variant="outline" disabled={apply.isPending}>
        {apply.isPending
          ? "Applying…"
          : bill.discountAmount > 0
            ? "Update discount"
            : "Apply discount"}
      </Button>
    </form>
  );
}

function PaymentForm({ bill }: { bill: BillDto }) {
  const pay = usePayBill();
  const [method, setMethod] = useState<Exclude<PaymentMethod, "LOYALTY_POINTS">>(
    (bill.rules.paymentMethods[0] as Exclude<PaymentMethod, "LOYALTY_POINTS"> | undefined) ??
      "CASH",
  );
  const [amount, setAmount] = useState(String(bill.balance));
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(false);
  const money = (n: number) => formatMoney(n, bill.currency);

  // When the balance moves (a payment or discount landed), start the form over from the new balance
  // without remounting, so an open split dialog survives live updates.
  const [seenBalance, setSeenBalance] = useState(bill.balance);
  if (seenBalance !== bill.balance) {
    setSeenBalance(bill.balance);
    setAmount(String(bill.balance));
    setTendered("");
  }

  const amountNumber = Number(amount) || 0;
  const tenderedNumber = tendered === "" ? amountNumber : Number(tendered);
  const change = method === "CASH" ? calculateChange(tenderedNumber, amountNumber) : 0;
  const short = method === "CASH" && tenderedNumber < amountNumber;

  return (
    <form
      aria-label="Take payment"
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await pay.mutateAsync({
            id: bill.id,
            input: {
              method,
              amount: amountNumber,
              ...(method === "CASH" && tendered !== "" && { tendered: Number(tendered) }),
              ...(reference.trim() && method !== "CASH" && { reference: reference.trim() }),
            },
          });
          setTendered("");
          setReference("");
        } catch (err) {
          setError(errorText(err, "Couldn't take the payment."));
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Take payment</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setSplitting(true)}>
          <Split className="size-4" aria-hidden /> Split bill
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Payment method"
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
          options={PAYMENT_METHODS.filter((m) => bill.rules.paymentMethods.includes(m)).map(
            (m) => ({
              value: m,
              label: PAYMENT_METHOD_LABELS[m],
            }),
          )}
        />
        <TextField
          label="Amount to pay"
          type="number"
          min={0.01}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      {method === "CASH" && (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Cash received"
            type="number"
            min={0}
            step="0.01"
            value={tendered}
            placeholder={String(amountNumber)}
            onChange={(e) => setTendered(e.target.value)}
            error={short ? "Less than the amount to pay" : undefined}
          />
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Change due</p>
            <p aria-live="polite" className="flex h-10 items-center text-lg font-semibold">
              {money(change)}
            </p>
          </div>
        </div>
      )}
      {method !== "CASH" && method !== "ROOM_CHARGE" && (
        <TextField
          label="Reference (optional)"
          value={reference}
          maxLength={60}
          onChange={(e) => setReference(e.target.value)}
          hint="Card approval code, transfer or wallet reference"
        />
      )}
      {method === "ROOM_CHARGE" && (
        <p className="rounded-md bg-surface-muted p-2.5 text-sm">
          Posted to the guest's room account and settled at check-out.
        </p>
      )}
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pay.isPending || amountNumber <= 0 || short}>
          {pay.isPending ? "Taking payment…" : `Take ${money(amountNumber)}`}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAmount(String(bill.balance))}>
          Full balance
        </Button>
      </div>
      {splitting && (
        <SplitDialog
          bill={bill}
          onClose={() => setSplitting(false)}
          onPick={(a) => setAmount(String(a))}
        />
      )}
    </form>
  );
}

function RefundDialog({
  payment,
  currency,
  onClose,
}: {
  payment: PaymentDto;
  currency: string;
  onClose: () => void;
}) {
  const refund = useRefundPayment();
  const left = Math.round((payment.amount - payment.refundedAmount) * 100) / 100;
  const [amount, setAmount] = useState(String(left));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Refund payment"
      description={`Up to ${formatMoney(left, currency)} can still be refunded on this ${PAYMENT_METHOD_LABELS[payment.method].toLowerCase()} payment.`}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await refund.mutateAsync({
              paymentId: payment.id,
              input: { amount: Number(amount), reason: reason.trim() },
            });
            onClose();
          } catch (err) {
            setError(errorText(err, "Couldn't refund."));
          }
        }}
      >
        <TextField
          label="Refund amount"
          type="number"
          min={0.01}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="Refund reason"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            type="submit"
            className="bg-danger text-white hover:bg-danger/90"
            disabled={refund.isPending || reason.trim().length < 3}
          >
            {refund.isPending ? "Refunding…" : "Refund"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Payments({ bill }: { bill: BillDto }) {
  const { can } = useAuth();
  const [refunding, setRefunding] = useState<PaymentDto | null>(null);
  const money = (n: number) => formatMoney(n, bill.currency);
  if (bill.payments.length === 0) return null;

  return (
    <section aria-label="Payments" className="space-y-2">
      <h2 className="text-sm font-semibold">Payments</h2>
      <ul className="space-y-2">
        {bill.payments.map((p) => (
          <li
            key={p.id}
            className="space-y-1 rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {PAYMENT_METHOD_LABELS[p.method]} · {money(p.amount)}
              </p>
              <span className="text-xs text-muted-foreground">
                {p.cashierName} · {formatTime(p.createdAt, "UTC")}
              </span>
            </div>
            {p.tendered !== null && (
              <p className="text-xs text-muted-foreground">
                Received {money(p.tendered)} · change {money(p.change ?? 0)}
              </p>
            )}
            {p.reference && <p className="text-xs text-muted-foreground">Ref {p.reference}</p>}
            {p.refunds.map((r) => (
              <p key={r.id} className="text-xs text-danger">
                Refunded {money(r.amount)} — {r.reason} ({r.byName})
              </p>
            ))}
            {can(Permissions.PAYMENTS_REFUND) && p.amount - p.refundedAmount > 0.004 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setRefunding(p)}
              >
                Refund {PAYMENT_METHOD_LABELS[p.method].toLowerCase()} payment
              </Button>
            )}
          </li>
        ))}
      </ul>
      {refunding && (
        <RefundDialog
          payment={refunding}
          currency={bill.currency}
          onClose={() => setRefunding(null)}
        />
      )}
    </section>
  );
}

function BillView({ bill }: { bill: BillDto }) {
  const { can } = useAuth();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  useLivePayments(bill.branchId);
  const money = (n: number) => formatMoney(n, bill.currency);
  const open = bill.status === "OPEN";
  const billable = bill.orderStatus === "SERVED" || bill.orderStatus === "PAYMENT_REQUESTED";

  return (
    <div className="space-y-6">
      <Link
        to="/app/cashier"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> Cashier
      </Link>
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold">Bill {bill.billNumber}</h1>
          <BillStatusBadge status={bill.status} />
        </div>
        <p className="text-muted-foreground">
          {bill.location} · Order{" "}
          {can(Permissions.ORDERS_VIEW) ? (
            <Link to={`/app/orders/${bill.orderId}`} className="text-primary hover:underline">
              {bill.orderNumber}
            </Link>
          ) : (
            bill.orderNumber
          )}
          {bill.guestName && ` · ${bill.guestName}`}
        </p>
      </header>

      {open && !billable && (
        <p role="alert" className="rounded-md border border-warning/50 bg-warning/15 p-3 text-sm">
          This order has dishes that haven't been served yet, so it can't be paid until they are.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section aria-label="Items" className="space-y-4">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {bill.lines.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {l.quantity} × {l.name}
                  </p>
                  {l.modifiers.length > 0 && (
                    <p className="text-xs text-muted-foreground">{l.modifiers.join(", ")}</p>
                  )}
                </div>
                <span>{money(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <Payments bill={bill} />
        </section>

        <aside
          aria-label="Bill summary"
          className="h-fit space-y-5 rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <Totals bill={bill} />
          {open && <BillCustomerPanel bill={bill} />}
          {open && bill.payments.length === 0 && (
            <DiscountForm key={bill.discountAmount} bill={bill} />
          )}
          {!open && bill.customer && (
            <p className="border-t border-border pt-4 text-sm">
              Customer: <span className="font-medium">{bill.customer.name}</span>
              {bill.pointsEarned > 0 && ` · earned ${bill.pointsEarned} points`}
            </p>
          )}
          {open && billable && bill.balance > 0 && <PaymentForm bill={bill} />}
          {bill.receiptId && (
            <div className="space-y-2 border-t border-border pt-4">
              <h2 className="text-sm font-semibold">Receipt</h2>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/app/receipts/${bill.receiptId}`}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <FileText className="size-4" aria-hidden /> View receipt
                </Link>
                <Button
                  variant="outline"
                  onClick={() =>
                    void downloadReceiptPdf(bill.receiptId!, `${bill.billNumber}.pdf`).catch((e) =>
                      setDownloadError(errorText(e, "Couldn't download the receipt.")),
                    )
                  }
                >
                  Download PDF
                </Button>
              </div>
              <FormError message={downloadError} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function BillPage() {
  const { id } = useParams();
  const { data, isPending, isError, refetch } = useBill(id);
  if (isPending) return <ListSkeleton />;
  if (isError || !data)
    return <ErrorState message="Couldn't load this bill." onRetry={() => void refetch()} />;
  return <BillView bill={data} />;
}
