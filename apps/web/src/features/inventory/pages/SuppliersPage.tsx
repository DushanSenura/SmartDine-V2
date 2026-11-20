import { SUPPLIER_STATUSES, type SupplierDto } from "@smartdine/shared";
import { Plus, Truck } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField, TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { titleCase } from "@/utils/format";

import { useArchiveSupplier, useSaveSupplier, useSuppliers } from "../api/inventoryQueries";

function SupplierDialog({ supplier, onClose }: { supplier?: SupplierDto; onClose: () => void }) {
  const save = useSaveSupplier();
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactPerson, setContactPerson] = useState(supplier?.contactPerson ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [products, setProducts] = useState(supplier?.products.join(", ") ?? "");
  const [status, setStatus] = useState<SupplierDto["status"]>(supplier?.status ?? "ACTIVE");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={supplier ? `Edit ${supplier.name}` : "New supplier"}
      description="Who you buy from and what they supply."
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!name.trim()) return setError("Enter the supplier's name.");
          try {
            await save.mutateAsync({
              id: supplier?.id,
              input: {
                name: name.trim(),
                contactPerson,
                email,
                phone,
                address,
                notes,
                status,
                products: products
                  .split(",")
                  .map((p) => p.trim())
                  .filter(Boolean),
              },
            });
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save the supplier.");
          }
        }}
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Supplier name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label="Contact person"
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <SelectField
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SupplierDto["status"])}
            options={SUPPLIER_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
          />
        </div>
        <TextField
          label="Products"
          hint="Comma-separated, e.g. rice, flour, oil"
          value={products}
          onChange={(e) => setProducts(e.target.value)}
        />
        <TextAreaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save supplier"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function SuppliersPage() {
  const { data, isPending, isError, refetch } = useSuppliers();
  const archive = useArchiveSupplier();
  const [editing, setEditing] = useState<SupplierDto | "new" | null>(null);
  const [archiving, setArchiving] = useState<SupplierDto | null>(null);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="The people and companies you buy stock from."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> New supplier
          </Button>
        }
      />
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load suppliers." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          text="Add the businesses you buy from so stock items can be linked to them."
          action={<Button onClick={() => setEditing("new")}>New supplier</Button>}
        />
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {data?.map((s) => (
          <li key={s.id} className="space-y-2 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{s.name}</p>
              <Badge tone={s.status === "ACTIVE" ? "success" : "neutral"}>
                {titleCase(s.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {[s.contactPerson, s.phone, s.email].filter(Boolean).join(" · ") ||
                "No contact details"}
            </p>
            {s.products.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Products">
                {s.products.map((p) => (
                  <li key={p} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs">
                    {p}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {s.itemCount} stock {s.itemCount === 1 ? "item" : "items"}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label={`Edit ${s.name}`}
                onClick={() => setEditing(s)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                aria-label={`Archive ${s.name}`}
                onClick={() => setArchiving(s)}
              >
                Archive
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <SupplierDialog
          supplier={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={`Archive ${archiving?.name ?? "this supplier"}?`}
        description="Its stock items stay, but are no longer linked to a supplier."
        confirmLabel="Archive"
        onConfirm={() => archive.mutateAsync(archiving!.id)}
      />
    </>
  );
}
