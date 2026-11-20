import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";

/** "Add" on a dish card; becomes a quantity stepper once the dish is in the order. */
export function AddToOrder({
  name,
  qty,
  onChange,
}: {
  name: string;
  qty: number;
  onChange: (qty: number) => void;
}) {
  if (qty === 0) {
    return (
      <Button
        type="button"
        size="sm"
        className="rounded-full"
        aria-label={`Add ${name} to order`}
        onClick={() => onChange(1)}
      >
        <Plus className="size-4" aria-hidden /> Add
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface p-1 shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        aria-label={`Remove one ${name} from order`}
        onClick={() => onChange(qty - 1)}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <span aria-label={`${qty} ${name} in order`} className="w-5 text-center text-sm font-medium">
        {qty}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        aria-label={`Add one more ${name} to order`}
        onClick={() => onChange(qty + 1)}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
