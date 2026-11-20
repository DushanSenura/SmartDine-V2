import { Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { formatDate, formatMoney } from "@/utils/format";

import { useCustomers } from "../api/customerQueries";

export function CustomersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { branch } = useCurrentBranch();
  const { data, isPending, isError, refetch, isFetching } = useCustomers(q.trim(), page);
  const currency = branch?.currency ?? "LKR";
  const meta = data?.meta;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone with an account: their visits, spend and loyalty points."
      />
      <form className="mb-4 max-w-md" role="search" onSubmit={(e) => e.preventDefault()}>
        <TextField
          label="Search customers"
          placeholder="Name, email or phone"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </form>
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load customers." onRetry={() => void refetch()} />}
      {data?.data.length === 0 && (
        <EmptyState
          icon={Users}
          title={q ? "No customers match" : "No customers yet"}
          text={
            q
              ? "Try a different name, email or phone."
              : "Customers appear here when they create an account."
          }
        />
      )}
      {data && data.data.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted-foreground" role="status">
            {meta!.total} {meta!.total === 1 ? "customer" : "customers"}
            {isFetching && " · updating…"}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Customer</th>
                  <th className="p-3 font-medium">Contact</th>
                  <th className="p-3 text-right font-medium">Visits</th>
                  <th className="p-3 text-right font-medium">Total spent</th>
                  <th className="p-3 text-right font-medium">Points</th>
                  <th className="p-3 font-medium">Last visit</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <Link
                        to={`/app/customers/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.firstName} {c.lastName}
                      </Link>
                    </td>
                    <td className="p-3">
                      <p>{c.email}</p>
                      <p className="text-xs text-muted-foreground">{c.phone ?? "No phone"}</p>
                    </td>
                    <td className="p-3 text-right tabular-nums">{c.visitCount}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatMoney(c.totalSpent, currency)}
                    </td>
                    <td className="p-3 text-right tabular-nums">{c.points}</td>
                    <td className="p-3">
                      {c.lastVisit ? formatDate(c.lastVisit.slice(0, 10)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
