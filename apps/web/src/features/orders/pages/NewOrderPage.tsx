import { Permissions, type OrderType } from "@smartdine/shared";
import { Minus, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { SelectField, TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { useTables } from "@/features/floor-plan/api/floorQueries";
import { useRooms } from "@/features/rooms/api/roomQueries";
import { cn } from "@/lib/utils";
import { formatMoney, titleCase } from "@/utils/format";

import { useApproveOrder, useCreateOrder, useSubmitOrder } from "../api/orderQueries";
import { MenuPicker } from "../components/MenuPicker";
import {
  addLine,
  cartTotal,
  lineTotal,
  toOrderLines,
  unitPrice,
  type CartLine,
} from "../utils/cart";

type Action = "draft" | "submit" | "send";

function Editor({ branchId }: { branchId: string }) {
  const { can } = useAuth();
  const { branch } = useCurrentBranch();
  const currency = branch?.currency ?? "LKR";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tables = useTables(branchId);
  const rooms = useRooms(branchId);
  const create = useCreateOrder();
  const submit = useSubmitOrder();
  const approve = useApproveOrder();

  const [type, setType] = useState<OrderType>(params.get("roomId") ? "ROOM_SERVICE" : "DINE_IN");
  const [tableId, setTableId] = useState(params.get("tableId") ?? "");
  const [roomId, setRoomId] = useState(params.get("roomId") ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [instructions, setInstructions] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seatable = (tables.data ?? []).filter((t) => t.status !== "OUT_OF_SERVICE");
  const occupiedRooms = (rooms.data ?? []).filter((r) => r.status === "OCCUPIED" && r.currentGuest);
  const target = type === "DINE_IN" ? tableId : roomId;

  const place = async (action: Action) => {
    setError(null);
    if (!target) return setError(type === "DINE_IN" ? "Choose a table." : "Choose a room.");
    if (action !== "draft" && lines.length === 0) return setError("Add at least one dish.");
    setBusy(true);
    let id: string | null = null;
    try {
      const order = await create.mutateAsync({
        type,
        tableId: type === "DINE_IN" ? tableId : undefined,
        roomId: type === "ROOM_SERVICE" ? roomId : undefined,
        guestName: guestName || null,
        guestCount: guestCount ? Number(guestCount) : null,
        kitchenInstructions: instructions || null,
        items: toOrderLines(lines),
      });
      id = order!.id;
      if (action === "submit") await submit.mutateAsync(id);
      if (action === "send") await approve.mutateAsync(id);
      navigate(`/app/orders/${id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      // The draft exists even if the follow-up step failed; open it instead of losing the work.
      if (id) navigate(`/app/orders/${id}`, { state: { notice: message } });
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="New order"
        description="Choose where it's going, add dishes, then send it to the kitchen."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <section aria-label="Menu" className="min-w-0 space-y-3">
          <MenuPicker
            branchId={branchId}
            currency={currency}
            onAdd={({ item, quantity, notes, modifierIds }) =>
              setLines((cur) => addLine(cur, item, quantity, notes, modifierIds))
            }
          />
        </section>

        <aside
          aria-label="Order"
          className="h-fit space-y-4 rounded-xl border border-border bg-surface p-4 shadow-sm xl:sticky xl:top-20"
        >
          <div
            role="group"
            aria-label="Order type"
            className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1"
          >
            {(["DINE_IN", "ROOM_SERVICE"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={cn(
                  "rounded-md py-1.5 text-sm font-medium transition-colors",
                  type === t ? "bg-surface shadow-sm" : "text-muted-foreground",
                )}
              >
                {t === "DINE_IN" ? "Dine-in" : "Room service"}
              </button>
            ))}
          </div>

          {type === "DINE_IN" ? (
            <SelectField
              label="Table"
              placeholder="Choose a table…"
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              options={seatable.map((t) => ({
                value: t.id,
                label: `Table ${t.tableNumber} · ${titleCase(t.status)}`,
              }))}
            />
          ) : (
            <SelectField
              label="Room"
              placeholder="Choose a room…"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              hint={occupiedRooms.length === 0 ? "No rooms have a checked-in guest." : undefined}
              options={occupiedRooms.map((r) => ({
                value: r.id,
                label: `Room ${r.roomNumber} · ${r.currentGuest}`,
              }))}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Guest name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
            <TextField
              label="Guests"
              type="number"
              min={1}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
            />
          </div>
          <TextAreaField
            label="Kitchen instructions"
            hint="Allergies, pacing, special requests"
            value={instructions}
            maxLength={500}
            onChange={(e) => setInstructions(e.target.value)}
          />

          <div className="space-y-2 border-t border-border pt-3">
            <h2 className="text-sm font-semibold">Dishes ({lines.length})</h2>
            {lines.length === 0 ? (
              <EmptyState
                icon={UtensilsCrossed}
                title="No dishes yet"
                text="Pick dishes from the menu."
              />
            ) : (
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li key={l.key} className="space-y-1.5 rounded-lg border border-border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.item.name}</p>
                        {l.modifierIds.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {l.item.modifiers
                              .filter((m) => l.modifierIds.includes(m.id))
                              .map((m) => m.name)
                              .join(", ")}
                          </p>
                        )}
                        {l.notes && <p className="text-xs text-muted-foreground">“{l.notes}”</p>}
                      </div>
                      <p className="shrink-0 text-sm">{formatMoney(lineTotal(l), currency)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center rounded-md border border-border">
                        <button
                          type="button"
                          aria-label={`Decrease ${l.item.name}`}
                          className="grid size-7 place-items-center"
                          onClick={() =>
                            setLines((cur) =>
                              l.quantity <= 1
                                ? cur.filter((x) => x.key !== l.key)
                                : cur.map((x) =>
                                    x.key === l.key ? { ...x, quantity: x.quantity - 1 } : x,
                                  ),
                            )
                          }
                        >
                          <Minus className="size-3.5" aria-hidden />
                        </button>
                        <output
                          aria-label={`Quantity of ${l.item.name}`}
                          className="w-6 text-center text-sm"
                        >
                          {l.quantity}
                        </output>
                        <button
                          type="button"
                          aria-label={`Increase ${l.item.name}`}
                          disabled={l.quantity >= 50}
                          className="grid size-7 place-items-center disabled:opacity-40"
                          onClick={() =>
                            setLines((cur) =>
                              cur.map((x) =>
                                x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x,
                              ),
                            )
                          }
                        >
                          <Plus className="size-3.5" aria-hidden />
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatMoney(unitPrice(l.item, l.modifierIds), currency)} each
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${l.item.name}`}
                        onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 className="size-4 text-danger" aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Subtotal</span>
              <span>{formatMoney(cartTotal(lines), currency)}</span>
            </p>
          </div>

          <FormError message={error} />
          <div className="grid gap-2">
            {can(Permissions.ORDERS_APPROVE) ? (
              <Button disabled={busy} onClick={() => void place("send")}>
                {busy ? "Sending…" : "Send to kitchen"}
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void place("submit")}>
                {busy ? "Submitting…" : "Submit for approval"}
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={() => void place("draft")}>
              Save draft
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}

export function NewOrderPage() {
  return <BranchRequired>{(branchId) => <Editor branchId={branchId} />}</BranchRequired>;
}
