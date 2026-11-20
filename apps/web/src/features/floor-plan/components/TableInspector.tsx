import { zodResolver } from "@hookform/resolvers/zod";
import {
  Permissions,
  TABLE_SHAPES,
  TABLE_STATUSES,
  updateTableSchema,
  type DiningAreaDto,
  type StaffDto,
  type TableDto,
  type UpdateTableInput,
} from "@smartdine/shared";
import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { SelectField, TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useLiveOrders, useOrders } from "@/features/orders/api/orderQueries";
import { OrderStatusBadge } from "@/features/orders/components/OrderBadges";
import { formatMoney } from "@/utils/format";

import { useDeleteTable, useSaveTable, useSetTableStatus } from "../api/floorQueries";
import { TABLE_STATUS_STYLES } from "../utils/tableStatus";

const nullable = { setValueAs: (v: string) => (v === "" ? null : v) };

function StatusControl({ table }: { table: TableDto }) {
  const setStatus = useSetTableStatus();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <SelectField
        label="Status"
        value={table.status}
        disabled={setStatus.isPending}
        options={TABLE_STATUSES.map((s) => ({ value: s, label: TABLE_STATUS_STYLES[s].label }))}
        onChange={async (e) => {
          setError(null);
          try {
            await setStatus.mutateAsync({
              id: table.id,
              status: e.target.value as TableDto["status"],
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't update status.");
          }
        }}
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function EditForm({
  table,
  areas,
  waiters,
  onDeleted,
}: {
  table: TableDto;
  areas: DiningAreaDto[];
  waiters: StaffDto[];
  onDeleted: () => void;
}) {
  const save = useSaveTable();
  const remove = useDeleteTable();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateTableInput>({
    resolver: zodResolver(updateTableSchema) as never,
    defaultValues: {
      tableNumber: table.tableNumber,
      name: table.name,
      section: table.section,
      capacity: table.capacity,
      shape: table.shape,
      diningAreaId: table.diningAreaId,
      assignedWaiterId: table.assignedWaiterId,
      notes: table.notes,
    },
  });

  return (
    <>
      <form
        noValidate
        className="space-y-3"
        onSubmit={handleSubmit(async (input) => {
          setError(null);
          setSaved(false);
          try {
            await save.mutateAsync({ id: table.id, input });
            setSaved(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        })}
      >
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Number"
            error={errors.tableNumber?.message}
            {...register("tableNumber")}
          />
          <TextField
            label="Seats"
            type="number"
            error={errors.capacity?.message}
            {...register("capacity", {
              setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
            })}
          />
        </div>
        <TextField label="Name" {...register("name", nullable)} />
        <TextField label="Section" {...register("section", nullable)} />
        <SelectField
          label="Shape"
          options={TABLE_SHAPES.map((s) => ({
            value: s,
            label: s.charAt(0) + s.slice(1).toLowerCase(),
          }))}
          {...register("shape")}
        />
        <SelectField
          label="Floor / area"
          options={areas.map((a) => ({ value: a.id, label: a.name }))}
          {...register("diningAreaId")}
        />
        <SelectField
          label="Assigned waiter"
          placeholder="Unassigned"
          options={waiters.map((w) => ({ value: w.id, label: `${w.firstName} ${w.lastName}` }))}
          {...register("assignedWaiterId", nullable)}
        />
        <TextAreaField label="Notes" {...register("notes", nullable)} />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
          <div className="flex items-center gap-2">
            {saved && (
              <span role="status" className="text-xs text-success">
                Saved
              </span>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete table ${table.tableNumber}?`}
        description="The table is removed from the floor plan."
        onConfirm={async () => {
          await remove.mutateAsync(table.id);
          onDeleted();
        }}
      />
    </>
  );
}

/** The table's open orders, live, with a shortcut to start a new one. */
function TableOrders({ table }: { table: TableDto }) {
  const { can } = useAuth();
  const canView = can(Permissions.ORDERS_VIEW);
  const { data } = useOrders(canView ? table.branchId : undefined, "active", { tableId: table.id });
  useLiveOrders(canView ? table.branchId : undefined);
  if (!canView) return null;

  return (
    <section aria-label="Orders" className="space-y-2">
      <h3 className="text-sm font-semibold">Orders</h3>
      {/* Reserve the line while loading so the panel doesn't jump when the orders arrive. */}
      {!data && <p className="text-sm text-muted-foreground">Loading orders…</p>}
      {data?.length === 0 && <p className="text-sm text-muted-foreground">No open orders.</p>}
      <ul className="space-y-2">
        {data?.map((o) => (
          <li key={o.id}>
            <Link
              to={`/app/orders/${o.id}`}
              className="block space-y-1 rounded-md border border-border p-2 text-sm hover:bg-surface-muted"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{o.orderNumber}</span>
                <OrderStatusBadge status={o.status} />
              </span>
              <span className="text-xs text-muted-foreground">
                {o.items.filter((i) => i.status !== "CANCELLED").length} dishes ·{" "}
                {formatMoney(o.subtotal, o.currency)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {can(Permissions.ORDERS_CREATE) && table.status !== "OUT_OF_SERVICE" && (
        <Link
          to={`/app/orders/new?tableId=${table.id}`}
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {data?.length ? "Add another order" : "Start order"}
        </Link>
      )}
    </section>
  );
}

export function TableInspector({
  table,
  areas,
  waiters,
  canManage,
  canChangeStatus,
  onClose,
}: {
  table: TableDto;
  areas: DiningAreaDto[];
  waiters: StaffDto[];
  canManage: boolean;
  canChangeStatus: boolean;
  onClose: () => void;
}) {
  const style = TABLE_STATUS_STYLES[table.status];
  const area = areas.find((a) => a.id === table.diningAreaId);

  return (
    <aside
      aria-label={`Table ${table.tableNumber} details`}
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Table {table.tableNumber}</h2>
          <p className="text-sm text-muted-foreground">
            {table.name ? `${table.name} · ` : ""}
            {table.capacity} seats · {area?.name}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close details" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            <style.icon className="size-4" aria-hidden /> {style.label}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Waiter</dt>
          <dd className="font-medium">{table.assignedWaiterName ?? "Unassigned"}</dd>
        </div>
        {table.section && (
          <div>
            <dt className="text-muted-foreground">Section</dt>
            <dd className="font-medium">{table.section}</dd>
          </div>
        )}
      </dl>
      {table.notes && <p className="rounded-md bg-surface-muted p-2 text-sm">{table.notes}</p>}
      <TableOrders table={table} />

      {canChangeStatus && <StatusControl table={table} />}
      {canManage && (
        <EditForm
          key={table.id}
          table={table}
          areas={areas}
          waiters={waiters}
          onDeleted={onClose}
        />
      )}
    </aside>
  );
}
