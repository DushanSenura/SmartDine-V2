import type { MenuItemDto } from "@smartdine/shared";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ErrorState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/forms/TextField";
import { usePublicMenu } from "@/features/public/api/publicQueries";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/format";

import { unitPrice } from "../utils/cart";

export interface PickedLine {
  item: MenuItemDto;
  quantity: number;
  notes: string;
  modifierIds: string[];
}

function OptionsDialog({
  item,
  currency,
  onAdd,
  onClose,
}: {
  item: MenuItemDto;
  currency: string;
  onAdd: (line: PickedLine) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const options = item.modifiers.filter((m) => m.isActive);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item.name}
      description="Choose options, quantity and any note for the kitchen."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({ item, quantity, notes, modifierIds: selected });
        }}
      >
        {options.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Options</legend>
            {options.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <span className="text-sm">{m.name}</span>
                <span className="flex items-center gap-3 text-sm text-muted-foreground">
                  {m.priceDelta !== 0 &&
                    `${m.priceDelta > 0 ? "+" : "−"}${formatMoney(Math.abs(m.priceDelta), currency)}`}
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={selected.includes(m.id)}
                    onChange={(e) =>
                      setSelected((cur) =>
                        e.target.checked ? [...cur, m.id] : cur.filter((id) => id !== m.id),
                      )
                    }
                  />
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <TextField
          label="Note for the kitchen"
          value={notes}
          maxLength={300}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. no onions, allergy"
        />
        <div className="flex items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Quantity"
            className="flex h-10 items-center rounded-md border border-border"
          >
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity(quantity - 1)}
              className="size-10 disabled:opacity-40"
            >
              −
            </button>
            <output className="w-8 text-center font-medium">{quantity}</output>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={quantity >= 50}
              onClick={() => setQuantity(quantity + 1)}
              className="size-10 disabled:opacity-40"
            >
              +
            </button>
          </div>
          <Button type="submit">
            Add · {formatMoney(unitPrice(item, selected) * quantity, currency)}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Browse the branch menu and add dishes. Dishes with options open a small dialog first. */
export function MenuPicker({
  branchId,
  currency,
  onAdd,
}: {
  branchId: string;
  currency: string;
  onAdd: (line: PickedLine) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<MenuItemDto | null>(null);
  const { data, isPending, isError, refetch } = usePublicMenu(branchId, {});

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (i) => (!category || i.categoryId === category) && (!q || i.name.toLowerCase().includes(q)),
    );
  }, [data, search, category]);

  const pick = (item: MenuItemDto) => {
    if (item.modifiers.some((m) => m.isActive)) setConfiguring(item);
    else onAdd({ item, quantity: 1, notes: "", modifierIds: [] });
  };

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search the menu</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dishes"
          className="h-10 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-sm"
        />
      </label>
      {data && (
        <div role="group" aria-label="Categories" className="flex gap-1 overflow-x-auto pb-1">
          {[{ id: null as string | null, name: "All" }, ...data.categories].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                category === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-surface-muted",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {isPending && (
        <div
          role="status"
          aria-label="Loading menu"
          className="h-40 animate-pulse rounded-lg bg-surface-muted motion-reduce:animate-none"
        />
      )}
      {isError && <ErrorState message="Couldn't load the menu." onRetry={() => void refetch()} />}
      {data && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No dishes match.</p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={!item.isAvailableNow}
              onClick={() => pick(item)}
              aria-label={`Add ${item.name}`}
              className="flex h-full w-full items-start justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-left transition-colors enabled:hover:bg-surface-muted disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatMoney(item.price, currency)}
                  {!item.isAvailableNow && " · unavailable"}
                  {item.modifiers.some((m) => m.isActive) && " · options"}
                </span>
              </span>
              {item.isAvailableNow && (
                <Plus className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
      {configuring && (
        <OptionsDialog
          item={configuring}
          currency={currency}
          onClose={() => setConfiguring(null)}
          onAdd={(line) => {
            onAdd(line);
            setConfiguring(null);
          }}
        />
      )}
    </div>
  );
}
