import {
  ORDER_STATUS_LABELS,
  type MenuItemDto,
  type OrderDto,
  type TableLookupDto,
} from "@smartdine/shared";
import { CircleCheck, ShoppingBag } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { usePublicMenu } from "@/features/public/api/publicQueries";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { ApiClientError } from "@/services/api/client";
import { formatMoney } from "@/utils/format";

import {
  lookupTable,
  useMyTableOrders,
  usePlaceTableOrder,
  useWaiterOptions,
} from "../api/tableOrderQueries";
import type { OrderCart } from "../hooks/useOrderCart";

const fieldClass =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const FINISHED = ["COMPLETED", "CANCELLED", "REFUNDED", "PAID"];

/**
 * The guest's order: table number, optional waiter, the dishes they added from the menu and a
 * button that sends it all to the kitchen. Also shows how their earlier orders are getting on.
 */
export function OrderPanel({ cart }: { cart: OrderCart }) {
  const { branch, currency } = usePublicBranch();
  // The full, unfiltered menu: dishes stay in the order even when a search hides them on screen.
  const menu = usePublicMenu(branch?.id);
  const waiters = useWaiterOptions(branch?.id, true);
  const mine = useMyTableOrders(true);
  const place = usePlaceTableOrder();

  const [tableNumber, setTableNumber] = useState("");
  const [table, setTable] = useState<TableLookupDto | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [waiterId, setWaiterId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<OrderDto | null>(null);

  const dishes = (menu.data?.items ?? []) as MenuItemDto[];
  const lines = dishes.filter((i) => (cart.cart[i.id] ?? 0) > 0);
  const total = lines.reduce((sum, i) => sum + i.price * (cart.cart[i.id] ?? 0), 0);

  const checkTable = async () => {
    const value = tableNumber.trim();
    if (!branch || !value) return null;
    try {
      const found = await lookupTable(branch.id, value);
      setTable(found);
      setTableError(null);
      // Offer the waiter who already looks after this table.
      if (!waiterId && found.assignedWaiterId) setWaiterId(found.assignedWaiterId);
      return found;
    } catch (e) {
      setTable(null);
      setTableError(e instanceof ApiClientError ? e.message : "Could not check that table.");
      return null;
    }
  };

  const submit = async () => {
    if (!branch) return;
    setError(null);
    if (!tableNumber.trim()) {
      setTableError("Enter the number shown on your table.");
      return;
    }
    if (!table && !(await checkTable())) return;
    try {
      const order = await place.mutateAsync({
        branchId: branch.id,
        tableNumber: tableNumber.trim(),
        waiterId: waiterId || undefined,
        kitchenInstructions: notes.trim() || undefined,
        items: lines.map((i) => ({
          menuItemId: i.id,
          quantity: cart.cart[i.id]!,
          modifierIds: [],
        })),
      });
      setPlaced(order);
      cart.clear();
      setNotes("");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
    }
  };

  const active = (mine.data ?? []).filter((o) => !FINISHED.includes(o.status));

  return (
    <aside
      id="your-order"
      aria-label="Your order"
      className="h-fit scroll-mt-24 space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-24"
    >
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        <ShoppingBag className="size-5 text-primary" aria-hidden /> Your order
      </h2>

      {placed && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-3"
        >
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">Order {placed.orderNumber} is with the kitchen.</p>
            <p className="text-muted-foreground">
              Table {placed.tableNumber} · {placed.waiterName} is looking after you.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="table-number" className="text-sm font-medium">
          Table number
        </label>
        <input
          id="table-number"
          autoComplete="off"
          value={tableNumber}
          placeholder="e.g. 12"
          maxLength={16}
          onChange={(e) => {
            setTableNumber(e.target.value);
            setTable(null);
            setTableError(null);
          }}
          onBlur={() => void checkTable()}
          className={fieldClass}
        />
        {table && (
          <p className="text-xs text-success">
            Table {table.tableNumber}
            {table.section ? ` · ${table.section}` : ""} found.
          </p>
        )}
        {tableError && (
          <p role="alert" className="text-xs text-danger">
            {tableError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="waiter" className="text-sm font-medium">
          Your waiter <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <select
          id="waiter"
          value={waiterId}
          onChange={(e) => setWaiterId(e.target.value)}
          className={fieldClass}
        >
          <option value="">Whoever is free</option>
          {(waiters.data ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Press Add on a dish to start your order.</p>
      ) : (
        <ul className="space-y-1 text-sm" aria-label="Dishes in your order">
          {lines.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span>
                {cart.cart[i.id]} × {i.name}
              </span>
              <span>{formatMoney(i.price * cart.cart[i.id]!, currency)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Note for the kitchen <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="notes"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Allergies, how you like it cooked…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex justify-between border-t border-border pt-3 font-medium">
        <span>Total before tax</span>
        <span>{formatMoney(total, currency)}</span>
      </div>
      <FormError message={error} />
      <Button
        type="button"
        className="w-full"
        disabled={cart.count === 0 || place.isPending}
        onClick={() => void submit()}
      >
        {place.isPending ? "Sending…" : `Send to kitchen${cart.count ? ` (${cart.count})` : ""}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        The bill is settled with the cashier once you have finished.
      </p>

      {active.length > 0 && (
        <section aria-label="Your orders so far" className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Your orders so far</h3>
          <ul className="space-y-2">
            {active.map((o) => (
              <li key={o.id} className="space-y-1 rounded-lg bg-surface-muted p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {o.orderNumber} · Table {o.tableNumber}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {o.items.reduce((n, i) => n + i.quantity, 0)} items · {o.waiterName}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
