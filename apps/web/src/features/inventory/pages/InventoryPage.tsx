import {
  INVENTORY_STATUS_LABELS,
  INVENTORY_STATUSES,
  type InventoryItemDto,
  type InventoryStatus,
  type StockTransactionType,
} from "@smartdine/shared";
import { Boxes, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { formatDate, formatMoney } from "@/utils/format";

import { useArchiveItem, useInventoryItems, useInventorySummary } from "../api/inventoryQueries";
import { ItemFormDialog } from "../components/ItemFormDialog";
import { MovementDialog } from "../components/MovementDialog";
import { StockBadge } from "../components/StockBadge";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "warn"
            ? "mt-1 text-2xl font-semibold text-warning"
            : "mt-1 text-2xl font-semibold"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Stock({ branchId }: { branchId: string }) {
  const [status, setStatus] = useState<InventoryStatus | "">("");
  const [q, setQ] = useState("");
  const items = useInventoryItems(branchId, {
    status: status || undefined,
    q: q.trim() || undefined,
  });
  const summary = useInventorySummary(branchId);
  const archive = useArchiveItem();
  const [editing, setEditing] = useState<InventoryItemDto | "new" | null>(null);
  const [moving, setMoving] = useState<{
    item: InventoryItemDto;
    type: StockTransactionType;
  } | null>(null);
  const [archiving, setArchiving] = useState<InventoryItemDto | null>(null);

  const categories = useMemo(
    () => [...new Set((items.data ?? []).map((i) => i.category))].sort(),
    [items.data],
  );
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Stock"
        description="What's on the shelves, what's running low and what's about to expire."
        actions={
          <>
            <Link
              to="/app/inventory/history"
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-muted"
            >
              Stock history
            </Link>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> New item
            </Button>
          </>
        }
      />

      <dl aria-label="Stock summary" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Items" value={s ? String(s.itemCount) : "…"} />
        <Stat
          label="Low stock"
          value={s ? String(s.lowStock) : "…"}
          tone={s?.lowStock ? "warn" : undefined}
        />
        <Stat
          label="Out of stock"
          value={s ? String(s.outOfStock) : "…"}
          tone={s?.outOfStock ? "warn" : undefined}
        />
        <Stat
          label="Expiring soon"
          value={s ? String(s.expiring) : "…"}
          tone={s?.expiring ? "warn" : undefined}
        />
        <Stat label="Stock value" value={s ? formatMoney(s.stockValue, s.currency) : "…"} />
      </dl>

      <form
        aria-label="Filters"
        className="mb-4 grid gap-3 sm:grid-cols-[1fr_14rem]"
        onSubmit={(e) => e.preventDefault()}
      >
        <TextField
          label="Search stock"
          placeholder="Name or SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SelectField
          label="Status"
          value={status}
          placeholder="All items"
          onChange={(e) => setStatus(e.target.value as InventoryStatus | "")}
          options={INVENTORY_STATUSES.map((v) => ({ value: v, label: INVENTORY_STATUS_LABELS[v] }))}
        />
      </form>

      {items.isPending && <ListSkeleton />}
      {items.isError && (
        <ErrorState message="Couldn't load stock." onRetry={() => void items.refetch()} />
      )}
      {items.data?.length === 0 && (
        <EmptyState
          icon={Boxes}
          title={q || status ? "No items match" : "No stock items yet"}
          text={
            q || status
              ? "Try a different search or status."
              : "Add your first ingredient or supply to start tracking it."
          }
          action={
            !q && !status ? <Button onClick={() => setEditing("new")}>New item</Button> : undefined
          }
        />
      )}
      {items.data && items.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Item</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 text-right font-medium">On hand</th>
                <th className="p-3 text-right font-medium">Reorder at</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Expires</th>
                <th className="p-3 font-medium">Supplier</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.data.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </td>
                  <td className="p-3">{item.category}</td>
                  <td className="p-3 text-right tabular-nums">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="p-3 text-right tabular-nums">{item.minimumQuantity}</td>
                  <td className="p-3">
                    <StockBadge status={item.status} />
                  </td>
                  <td className="p-3">{item.expiryDate ? formatDate(item.expiryDate) : "—"}</td>
                  <td className="p-3">{item.supplierName ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Record movement for ${item.name}`}
                        onClick={() => setMoving({ item, type: "USE" })}
                      >
                        Move
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => setEditing(item)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        aria-label={`Archive ${item.name}`}
                        onClick={() => setArchiving(item)}
                      >
                        Archive
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ItemFormDialog
          branchId={branchId}
          item={editing === "new" ? undefined : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
      {moving && (
        <MovementDialog
          item={moving.item}
          initialType={moving.type}
          onClose={() => setMoving(null)}
        />
      )}
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={`Archive ${archiving?.name ?? "this item"}?`}
        description="It leaves the stock list. Its movement history is kept."
        confirmLabel="Archive"
        onConfirm={() => archive.mutateAsync(archiving!.id)}
      />
    </>
  );
}

export function InventoryPage() {
  return <BranchRequired>{(branchId) => <Stock branchId={branchId} />}</BranchRequired>;
}
