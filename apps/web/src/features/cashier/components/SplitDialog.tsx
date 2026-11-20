import { shareOfBill, splitEqually, type BillDto } from "@smartdine/shared";
import { useMemo, useState } from "react";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/format";

/**
 * Helps work out one guest's share of the bill. Choosing a share only fills in the amount; the
 * cashier still takes each payment (any method) in the normal payment form.
 */
export function SplitDialog({
  bill,
  onPick,
  onClose,
}: {
  bill: BillDto;
  onPick: (amount: number) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"equal" | "items">("equal");
  const [parts, setParts] = useState(2);
  const [picked, setPicked] = useState<number[]>([]);
  const money = (n: number) => formatMoney(n, bill.currency);

  const shares = useMemo(() => splitEqually(bill.total, Math.max(1, parts)), [bill.total, parts]);
  const itemsSubtotal = picked.reduce((sum, i) => sum + (bill.lines[i]?.lineTotal ?? 0), 0);
  const itemShare = shareOfBill(bill.total, bill.subtotal, itemsSubtotal);

  // A share can never exceed what is still owed.
  const choose = (amount: number) => {
    onPick(Math.min(amount, bill.balance));
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Split the bill"
      description="Service charge, tax and discount are shared out in proportion."
    >
      <div className="space-y-4">
        <div
          role="group"
          aria-label="Split method"
          className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1"
        >
          {(["equal", "items"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium",
                mode === m ? "bg-surface shadow-sm" : "text-muted-foreground",
              )}
            >
              {m === "equal" ? "Split equally" : "Split by dishes"}
            </button>
          ))}
        </div>

        {mode === "equal" ? (
          <div className="space-y-3">
            <TextField
              label="Number of guests"
              type="number"
              min={1}
              max={20}
              value={parts}
              onChange={(e) => setParts(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            />
            <ul className="space-y-1.5">
              {shares.map((amount, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="text-sm">Guest {i + 1}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium">{money(amount)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Use share for guest ${i + 1}`}
                      onClick={() => choose(amount)}
                    >
                      Use
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-1.5">
              {bill.lines.map((l, i) => (
                <li key={i}>
                  <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={picked.includes(i)}
                        onChange={(e) =>
                          setPicked((cur) =>
                            e.target.checked ? [...cur, i] : cur.filter((x) => x !== i),
                          )
                        }
                      />
                      {l.quantity} × {l.name}
                    </span>
                    <span>{money(l.lineTotal)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="flex justify-between font-medium">
              <span>Share with service &amp; tax</span>
              <span>{money(itemShare)}</span>
            </p>
            <Button disabled={picked.length === 0} onClick={() => choose(itemShare)}>
              Use this share
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
