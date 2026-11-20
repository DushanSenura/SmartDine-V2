import { PAYMENT_METHOD_LABELS, Permissions } from "@smartdine/shared";
import { Receipt } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { ClockCard } from "@/features/shifts/components/ClockCard";
import { formatMoney } from "@/utils/format";

import {
  useBillQueue,
  useGenerateBill,
  useLivePayments,
  usePaymentSummary,
} from "../api/cashierQueries";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function Dashboard({ branchId }: { branchId: string }) {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const queue = useBillQueue(branchId);
  const summary = usePaymentSummary(branchId, user?.role === "CASHIER" ? "mine" : "branch");
  const generate = useGenerateBill();
  const [error, setError] = useState<string | null>(null);
  useLivePayments(branchId);

  const open = async (orderId: string, billId: string | null) => {
    setError(null);
    try {
      const id = billId ?? (await generate.mutateAsync(orderId)).id;
      navigate(`/app/cashier/bills/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the bill.");
    }
  };
  const s = summary.data;
  const money = (n: number) => formatMoney(n, s?.currency ?? "LKR");

  return (
    <>
      <PageHeader
        title="Cashier"
        description="Bills waiting for payment, and today's takings."
        actions={
          can(Permissions.PAYMENTS_PROCESS) && (
            <Link
              to="/app/payments"
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-muted"
            >
              Payment history
            </Link>
          )
        }
      />

      <section aria-label="Today's takings" className="mb-6 space-y-3">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label={s?.scope === "branch" ? "Branch collected today" : "Your collected today"}
            value={s ? money(s.collected) : "…"}
          />
          <Stat label="Refunds today" value={s ? money(s.refunded) : "…"} />
          <Stat label="Net" value={s ? money(s.net) : "…"} />
          <Stat label="Payments taken" value={s ? String(s.paymentCount) : "…"} />
        </dl>
        {s && s.byMethod.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="By payment method">
            {s.byMethod.map((m) => (
              <li key={m.method} className="rounded-full bg-surface-muted px-3 py-1 text-xs">
                {PAYMENT_METHOD_LABELS[m.method]}: {money(m.total)} ({m.count})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Waiting for payment" className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Waiting for payment</h2>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {queue.isPending && <ListSkeleton rows={3} />}
        {queue.isError && (
          <ErrorState message="Couldn't load bills." onRetry={() => void queue.refetch()} />
        )}
        {queue.data?.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="No bills waiting"
            text="Orders appear here as soon as they're served or the waiter requests the bill."
          />
        )}
        <ul className="grid gap-2 lg:grid-cols-2">
          {queue.data?.map((q) => (
            <li
              key={q.orderId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div className="space-y-0.5">
                <p className="font-medium">
                  {q.location} · {q.orderNumber}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(q.total ?? q.subtotal, q.currency)}
                  {q.total === null && " before service & tax"} · {q.waiterName}
                  {q.paidAmount > 0 && ` · ${formatMoney(q.paidAmount, q.currency)} paid`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {q.orderStatus === "PAYMENT_REQUESTED" ? "Bill requested" : "Served"}
                </p>
              </div>
              <Button
                disabled={generate.isPending}
                aria-label={`Open bill for ${q.location}`}
                onClick={() => void open(q.orderId, q.billId)}
              >
                Open bill
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-6 max-w-md">
        <ClockCard />
      </div>
    </>
  );
}

export function CashierDashboard() {
  return <BranchRequired>{(branchId) => <Dashboard branchId={branchId} />}</BranchRequired>;
}
