import { zodResolver } from "@hookform/resolvers/zod";
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  type CreateInventoryItemInput,
  type InventoryItemDto,
} from "@smartdine/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";

import { useCreateItem, useSuppliers, useUpdateItem } from "../api/inventoryQueries";

const number = { setValueAs: (v: string) => (v === "" || v == null ? undefined : Number(v)) };
const nullable = { setValueAs: (v: string) => (v === "" ? null : v) };

export function ItemFormDialog({
  branchId,
  item,
  categories,
  onClose,
}: {
  branchId: string;
  item?: InventoryItemDto;
  categories: string[];
  onClose: () => void;
}) {
  const suppliers = useSuppliers();
  const create = useCreateItem();
  const update = useUpdateItem();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateInventoryItemInput>({
    resolver: zodResolver(
      (item
        ? updateInventoryItemSchema
        : createInventoryItemSchema) as typeof createInventoryItemSchema,
    ) as never,
    defaultValues: item
      ? {
          name: item.name,
          sku: item.sku,
          category: item.category,
          unit: item.unit,
          minimumQuantity: item.minimumQuantity,
          cost: item.cost,
          supplierId: item.supplierId,
          expiryDate: item.expiryDate,
          storageLocation: item.storageLocation,
        }
      : { branchId, quantity: 0, minimumQuantity: 0, cost: 0 },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item ? `Edit ${item.name}` : "New stock item"}
      description={
        item
          ? "Quantity changes are recorded as stock movements, not edited here."
          : "Opening stock is recorded as the first purchase."
      }
      size="lg"
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (input) => {
          setError(null);
          try {
            if (item) {
              const { quantity: _q, branchId: _b, ...rest } = input;
              void _q;
              void _b;
              await update.mutateAsync({ id: item.id, input: rest });
            } else {
              await create.mutateAsync(input);
            }
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        })}
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" error={errors.name?.message} {...register("name")} />
          <TextField label="SKU" error={errors.sku?.message} {...register("sku")} />
          <div>
            <TextField
              label="Category"
              list="stock-categories"
              error={errors.category?.message}
              {...register("category")}
            />
            <datalist id="stock-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <TextField
            label="Unit"
            placeholder="kg, l, pcs"
            error={errors.unit?.message}
            {...register("unit")}
          />
          {!item && (
            <TextField
              label="Opening quantity"
              type="number"
              step="0.001"
              error={errors.quantity?.message}
              {...register("quantity", number)}
            />
          )}
          <TextField
            label="Reorder level"
            type="number"
            step="0.001"
            hint="Flagged as low stock at or below this"
            error={errors.minimumQuantity?.message}
            {...register("minimumQuantity", number)}
          />
          <TextField
            label="Cost per unit"
            type="number"
            step="0.01"
            error={errors.cost?.message}
            {...register("cost", number)}
          />
          <SelectField
            label="Supplier"
            placeholder="None"
            options={(suppliers.data ?? [])
              .filter((s) => s.status === "ACTIVE" || s.id === item?.supplierId)
              .map((s) => ({ value: s.id, label: s.name }))}
            {...register("supplierId", nullable)}
          />
          <TextField label="Expiry date" type="date" {...register("expiryDate", nullable)} />
          <TextField label="Storage location" {...register("storageLocation", nullable)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || update.isPending}>
            {create.isPending || update.isPending ? "Saving…" : "Save item"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
