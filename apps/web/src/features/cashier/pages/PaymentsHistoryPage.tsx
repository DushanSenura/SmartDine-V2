import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@smartdine/shared";
import { Banknote } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { formatDateTime, formatMoney } from "@/utils/format";

import { useLivePayments, usePayments } from "../api/cashierQueries";

function History({ branchId }: { branchId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const { branch } = useCurrentBranch();
  const timezone = branch?.timezone ?? "UTC";
  const currency = branch?.currency ?? "LKR";
  const { data, isPending, isError, refetch } = usePayments(branchId, {
    from: from || undefined,
    to: to || undefined,
    method: method || undefined,
  });
  useLivePayments(branchId);
  const total = (data ?? []).reduce((sum, p) => sum + p.amount - p.refundedAmount, 0);

  return (
    <>
      <PageHeader
        title="Payment history"
        description="Every payment taken, with refunds. Leave the dates empty for today."
      />
      <form aria-label="Filters" className="mb-4 grid gap-3 sm:grid-cols-3">
        <TextField
          label="From"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <TextField
          label="To"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
        />
        <SelectField
          label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod | "")}
          placeholder="All methods"
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
        />
      </form>
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load payments." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={Banknote}
          title="No payments in this period"
          text="Try a different date range or method."
        />
      )}
      {data && data.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted-foreground" role="status">
            {data.length} {data.length === 1 ? "payment" : "payments"} · net{" "}
            {formatMoney(total, currency)}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Time</th>
                  <th className="p-3 font-medium">Bill</th>
                  <th className="p-3 font-medium">Order</th>
                  <th className="p-3 font-medium">Method</th>
                  <th className="p-3 text-right font-medium">Amount</th>
                  <th className="p-3 text-right font-medium">Refunded</th>
                  <th className="p-3 font-medium">Cashier</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="p-3">{formatDateTime(p.createdAt, timezone)}</td>
                    <td className="p-3">
                      <Link
                        to={`/app/cashier/bills/${p.billId}`}
                        className="text-primary hover:underline"
                      >
                        {p.billNumber}
                      </Link>
                    </td>
                    <td className="p-3">{p.orderNumber}</td>
                    <td className="p-3">{PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td className="p-3 text-right">{formatMoney(p.amount, currency)}</td>
                    <td className="p-3 text-right">
                      {p.refundedAmount ? formatMoney(p.refundedAmount, currency) : "—"}
                    </td>
                    <td className="p-3">{p.cashierName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export function PaymentsHistoryPage() {
  return <BranchRequired>{(branchId) => <History branchId={branchId} />}</BranchRequired>;
}
