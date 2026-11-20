import {
  STOCK_TRANSACTION_LABELS,
  type InventoryItemDto,
  type StockMovementInput,
  type StockTransactionType,
} from "@smartdine/shared";
import { useState } from "react";

import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useBranches } from "@/features/branches/api/branchQueries";

import { useMoveStock } from "../api/inventoryQueries";

/** Record one stock movement. A count states what's on the shelf; everything else states how much moved. */
export function MovementDialog({
  item,
  initialType = "USE",
  onClose,
}: {
  item: InventoryItemDto;
  initialType?: StockTransactionType;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const branches = useBranches();
  const move = useMoveStock();
  const [type, setType] = useState<StockTransactionType>(initialType);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only an owner can move stock between branches.
  const types = (Object.keys(STOCK_TRANSACTION_LABELS) as StockTransactionType[]).filter(
    (t) => t !== "TRANSFER" || user?.role === "OWNER",
  );
  const otherBranches = (branches.data ?? []).filter((b) => b.id !== item.branchId);
  const amount = Number(quantity);

  const build = (): StockMovementInput | string => {
    if (quantity === "" || !Number.isFinite(amount) || amount < 0) return "Enter a quantity.";
    const common = { note: note.trim() || undefined, reference: reference.trim() || undefined };
    if (type === "ADJUSTMENT") return { type, countedQuantity: amount, ...common };
    if (amount <= 0) return "Enter a quantity above zero.";
    if (type === "TRANSFER") {
      return toBranchId ? { type, quantity: amount, toBranchId, ...common } : "Choose a branch.";
    }
    return {
      type,
      quantity: amount,
      ...(type === "PURCHASE" && unitCost !== "" && { unitCost: Number(unitCost) }),
      ...common,
    };
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Record movement — ${item.name}`}
      description={`${item.quantity} ${item.unit} on hand.`}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const input = build();
          if (typeof input === "string") return setError(input);
          try {
            await move.mutateAsync({ id: item.id, input });
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't record the movement.");
          }
        }}
      >
        <SelectField
          label="Movement"
          value={type}
          onChange={(e) => setType(e.target.value as StockTransactionType)}
          options={types.map((t) => ({ value: t, label: STOCK_TRANSACTION_LABELS[t] }))}
        />
        <TextField
          label={
            type === "ADJUSTMENT" ? `Counted quantity (${item.unit})` : `Quantity (${item.unit})`
          }
          type="number"
          step="0.001"
          min={0}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={type === "ADJUSTMENT" ? "What is actually on the shelf now" : undefined}
        />
        {type === "PURCHASE" && (
          <TextField
            label="Cost per unit"
            type="number"
            step="0.01"
            min={0}
            value={unitCost}
            placeholder={String(item.cost)}
            onChange={(e) => setUnitCost(e.target.value)}
          />
        )}
        {type === "TRANSFER" && (
          <SelectField
            label="Transfer to"
            placeholder="Choose a branch…"
            value={toBranchId}
            onChange={(e) => setToBranchId(e.target.value)}
            options={otherBranches.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Reference"
            value={reference}
            maxLength={80}
            onChange={(e) => setReference(e.target.value)}
          />
          <TextField
            label="Note"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={move.isPending}>
            {move.isPending ? "Saving…" : "Record"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
