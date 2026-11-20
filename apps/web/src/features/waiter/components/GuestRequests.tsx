import {
  SERVICE_REQUEST_TYPE_LABELS,
  SERVICE_REQUEST_TYPES,
  type ServiceRequestType,
} from "@smartdine/shared";
import { Check, HandHelping } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useTables } from "@/features/floor-plan/api/floorQueries";

import {
  useCreateServiceRequest,
  useResolveServiceRequest,
  useServiceRequests,
} from "../api/serviceRequestQueries";

/** Open guest requests, plus a quick form to log a new one for a table. */
export function GuestRequests({ branchId }: { branchId: string }) {
  const { data: requests } = useServiceRequests(branchId);
  const { data: tables } = useTables(branchId);
  const create = useCreateServiceRequest();
  const resolve = useResolveServiceRequest();
  const [tableId, setTableId] = useState("");
  const [type, setType] = useState<ServiceRequestType>("ASSISTANCE");
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const open = requests ?? [];
  return (
    <section aria-label="Guest requests" className="space-y-2 lg:col-span-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        Guest requests
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">{open.length}</span>
      </h2>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tableId) return;
          void run(async () => {
            await create.mutateAsync({ tableId, type });
          });
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Table</span>
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option value="">Choose a table…</option>
            {(tables ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.tableNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Request</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ServiceRequestType)}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            {SERVICE_REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {SERVICE_REQUEST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={!tableId || create.isPending}>
          <HandHelping className="size-4" aria-hidden /> Log request
        </Button>
      </form>
      {open.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No guests are waiting on anything.
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3"
            >
              <div>
                <p className="font-medium">
                  Table {r.tableNumber} · {SERVICE_REQUEST_TYPE_LABELS[r.type]}
                </p>
                {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={resolve.isPending}
                onClick={() => void run(() => resolve.mutateAsync(r.id))}
              >
                <Check className="size-4" aria-hidden /> Done · Table {r.tableNumber}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
