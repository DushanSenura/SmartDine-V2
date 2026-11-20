import {
  STOCK_TRANSACTION_LABELS,
  STOCK_TRANSACTION_TYPES,
  type StockTransactionType,
} from "@smartdine/shared";
import { History } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { formatDateTime } from "@/utils/format";

import { useStockTransactions } from "../api/inventoryQueries";

function History_({ branchId }: { branchId: string }) {
  const [type, setType] = useState<StockTransactionType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { branch } = useCurrentBranch();
  const { data, isPending, isError, refetch } = useStockTransactions(branchId, {
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  return (
    <>
      <PageHeader
        title="Stock history"
        description="Every movement, newest first. Leave the dates empty for the most recent activity."
        actions={
          <Link
            to="/app/inventory"
            className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-muted"
          >
            Back to stock
          </Link>
        }
      />
      <form
        aria-label="Filters"
        className="mb-4 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <SelectField
          label="Movement"
          value={type}
          placeholder="All movements"
          onChange={(e) => setType(e.target.value as StockTransactionType | "")}
          options={STOCK_TRANSACTION_TYPES.map((t) => ({
            value: t,
            label: STOCK_TRANSACTION_LABELS[t],
          }))}
        />
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
      </form>
      {isPending && <ListSkeleton />}
      {isError && (
        <ErrorState message="Couldn't load the history." onRetry={() => void refetch()} />
      )}
      {data?.length === 0 && (
        <EmptyState icon={History} title="No movements" text="Nothing matches these filters." />
      )}
      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Item</th>
                <th className="p-3 font-medium">Movement</th>
                <th className="p-3 text-right font-medium">Change</th>
                <th className="p-3 text-right font-medium">Balance</th>
                <th className="p-3 font-medium">By</th>
                <th className="p-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="p-3">{formatDateTime(t.createdAt, branch?.timezone ?? "UTC")}</td>
                  <td className="p-3">
                    <p className="font-medium">{t.itemName}</p>
                    <p className="text-xs text-muted-foreground">{t.sku}</p>
                  </td>
                  <td className="p-3">{STOCK_TRANSACTION_LABELS[t.type]}</td>
                  <td
                    className={
                      t.quantityChange < 0
                        ? "p-3 text-right tabular-nums text-danger"
                        : "p-3 text-right tabular-nums text-success"
                    }
                  >
                    {t.quantityChange > 0 ? "+" : ""}
                    {t.quantityChange} {t.unit}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {t.quantityAfter} {t.unit}
                  </td>
                  <td className="p-3">{t.userName ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {[t.reference, t.note].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function StockHistoryPage() {
  return <BranchRequired>{(branchId) => <History_ branchId={branchId} />}</BranchRequired>;
}
