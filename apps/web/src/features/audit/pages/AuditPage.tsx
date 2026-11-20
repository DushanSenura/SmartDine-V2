import { AUDIT_ENTITIES, type AuditEntryDto } from "@smartdine/shared";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useState } from "react";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { apiRequest } from "@/services/api/client";
import { formatDateTime, titleCase } from "@/utils/format";

interface Page {
  data: AuditEntryDto[];
  meta: { total: number; page: number; pageSize: number };
}

function useAudit(
  filters: { entity: string; action: string; from: string; to: string },
  page: number,
) {
  const params = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return useQuery({
    queryKey: ["audit", filters, page],
    queryFn: ({ signal }) => apiRequest<Page>(`/audit?${params}`, { signal, envelope: true }),
    placeholderData: keepPreviousData,
  });
}

/** "price: 1000 → 1250" for each field that changed. */
function Changes({ previous, next }: { previous: unknown; next: unknown }) {
  const before = (previous && typeof previous === "object" ? previous : {}) as Record<
    string,
    unknown
  >;
  const after = (next && typeof next === "object" ? next : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  if (keys.length === 0) return <span className="text-muted-foreground">—</span>;
  const show = (v: unknown) =>
    v === null || v === undefined ? "none" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <ul className="space-y-0.5 text-xs">
      {keys.map((k) => (
        <li key={k}>
          <span className="font-medium">{k}</span>:{" "}
          {k in before && (
            <span className="text-muted-foreground line-through">{show(before[k])}</span>
          )}
          {k in before && k in after && " → "}
          {k in after && <span>{show(after[k])}</span>}
        </li>
      ))}
    </ul>
  );
}

export function AuditPage() {
  const [filters, setFilters] = useState({ entity: "", action: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useAudit(filters, page);
  const set = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const meta = data?.meta;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Entries are written as things happen and can't be edited."
      />
      <form
        aria-label="Filters"
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <SelectField
          label="Area"
          value={filters.entity}
          placeholder="Everything"
          onChange={(e) => set("entity", e.target.value)}
          options={AUDIT_ENTITIES.map((a) => ({ value: a, label: titleCase(a.replace("_", " ")) }))}
        />
        <TextField
          label="Action contains"
          placeholder="e.g. refund"
          value={filters.action}
          onChange={(e) => set("action", e.target.value)}
        />
        <TextField
          label="From"
          type="date"
          value={filters.from}
          onChange={(e) => set("from", e.target.value)}
        />
        <TextField
          label="To"
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(e) => set("to", e.target.value)}
        />
      </form>

      {isPending && <ListSkeleton />}
      {isError && (
        <ErrorState message="Couldn't load the audit log." onRetry={() => void refetch()} />
      )}
      {data?.data.length === 0 && (
        <EmptyState icon={ScrollText} title="No entries" text="Nothing matches these filters." />
      )}
      {data && data.data.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted-foreground" role="status">
            {meta!.total} {meta!.total === 1 ? "entry" : "entries"}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">When</th>
                  <th className="p-3 font-medium">Who</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">Details</th>
                  <th className="p-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((e) => (
                  <tr key={e.id} className="border-b border-border align-top last:border-0">
                    <td className="p-3 whitespace-nowrap">
                      {formatDateTime(
                        e.createdAt,
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                      )}
                    </td>
                    <td className="p-3">
                      <p>{e.userName ?? "System"}</p>
                      {e.role && (
                        <p className="text-xs text-muted-foreground">{e.role.toLowerCase()}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <p className="font-medium">{e.action}</p>
                      <p className="text-xs text-muted-foreground">{e.entity}</p>
                    </td>
                    <td className="p-3">
                      <Changes previous={e.previousValue} next={e.newValue} />
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{e.ip ?? "—"}</td>
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
