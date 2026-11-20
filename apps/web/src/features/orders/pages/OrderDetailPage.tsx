import {
  KITCHEN_PHASE_STATUSES,
  ORDER_STATUS_LABELS,
  Permissions,
  type OrderDto,
  type OrderItemDto,
  type OrderStatus,
} from "@smartdine/shared";
import { ChevronLeft, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { formatDateTime, formatMoney } from "@/utils/format";

import {
  useAddItems,
  useApproveOrder,
  useCancelItem,
  useCancelOrder,
  useLiveOrders,
  useOrder,
  useRejectOrder,
  useRequestPayment,
  useServeItems,
  useSubmitOrder,
  useUpdateDraftItem,
} from "../api/orderQueries";
import { ItemStatusBadge, OrderStatusBadge } from "../components/OrderBadges";
import { MenuPicker } from "../components/MenuPicker";
import { ReasonDialog } from "../components/ReasonDialog";
import { toOrderLines } from "../utils/cart";

const KITCHEN_PHASE: readonly OrderStatus[] = KITCHEN_PHASE_STATUSES;

function ItemRow({
  order,
  item,
  onCancel,
}: {
  order: OrderDto;
  item: OrderItemDto;
  onCancel: (item: OrderItemDto) => void;
}) {
  const { can, user } = useAuth();
  const serve = useServeItems();
  const update = useUpdateDraftItem();
  const [error, setError] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, order.currency);
  const isManager = user?.role === "MANAGER" || user?.role === "OWNER";
  const draft = order.status === "DRAFT";
  const cancellable =
    can(Permissions.ORDERS_CREATE) &&
    !draft &&
    item.status !== "SERVED" &&
    item.status !== "CANCELLED" &&
    (item.status === "PENDING" || isManager) &&
    (KITCHEN_PHASE.includes(order.status) || order.status === "PENDING_APPROVAL");

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <li className="space-y-1 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={
              item.status === "CANCELLED" ? "font-medium line-through opacity-60" : "font-medium"
            }
          >
            {item.quantity} × {item.name}
          </p>
          {item.modifiers.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {item.modifiers.map((m) => m.name).join(", ")}
            </p>
          )}
          {item.notes && <p className="text-sm">“{item.notes}”</p>}
          {item.allergens.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Contains: {item.allergens.join(", ").toLowerCase()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ItemStatusBadge status={item.status} />
          <span className="text-sm">{money(item.lineTotal)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {draft && can(Permissions.ORDERS_CREATE) && (
          <>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Decrease ${item.name}`}
              disabled={item.quantity <= 1 || update.isPending}
              onClick={() =>
                void run(() =>
                  update.mutateAsync({
                    id: order.id,
                    itemId: item.id,
                    quantity: item.quantity - 1,
                  }),
                )
              }
            >
              −
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Increase ${item.name}`}
              disabled={item.quantity >= 50 || update.isPending}
              onClick={() =>
                void run(() =>
                  update.mutateAsync({
                    id: order.id,
                    itemId: item.id,
                    quantity: item.quantity + 1,
                  }),
                )
              }
            >
              +
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => onCancel(item)}
            >
              Remove
            </Button>
          </>
        )}
        {item.status === "PREPARED" &&
          can(Permissions.ORDERS_SERVE) &&
          KITCHEN_PHASE.includes(order.status) && (
            <Button
              size="sm"
              disabled={serve.isPending}
              onClick={() =>
                void run(() => serve.mutateAsync({ id: order.id, itemIds: [item.id] }))
              }
            >
              Serve
            </Button>
          )}
        {cancellable && (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => onCancel(item)}>
            Cancel dish
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function OrderView({ order }: { order: OrderDto }) {
  const { can, user } = useAuth();
  const location = useLocation();
  const submit = useSubmitOrder();
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  const cancel = useCancelOrder();
  const cancelItem = useCancelItem();
  const serve = useServeItems();
  const requestPayment = useRequestPayment();
  const addItems = useAddItems();
  const [error, setError] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [adding, setAdding] = useState(false);
  const [dialog, setDialog] = useState<"cancel" | "reject" | { item: OrderItemDto } | null>(null);
  useLiveOrders(order.branchId);

  const money = (n: number) => formatMoney(n, order.currency);
  const isManager = user?.role === "MANAGER" || user?.role === "OWNER";
  const inKitchen = KITCHEN_PHASE.includes(order.status);
  const ready = order.items.filter((i) => i.status === "PREPARED");
  const canAdd =
    can(Permissions.ORDERS_CREATE) &&
    (order.status === "DRAFT" || (inKitchen && can(Permissions.ORDERS_APPROVE)));
  const closed = !["DRAFT", "PENDING_APPROVAL", "PAYMENT_REQUESTED", ...KITCHEN_PHASE].includes(
    order.status,
  );

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const rounds = [...new Set(order.items.map((i) => i.round))];

  return (
    <div className="space-y-6">
      <Link
        to="/app/orders"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> All orders
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold">Order {order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-muted-foreground">
          {order.type === "DINE_IN"
            ? `Table ${order.tableNumber}`
            : `Room service · Room ${order.roomNumber}`}
          {order.guestName && ` · ${order.guestName}`}
          {order.guestCount && ` · ${order.guestCount} guests`} · Waiter {order.waiterName}
          {order.selfOrdered && " · Ordered by the guest"}
        </p>
        {order.kitchenInstructions && (
          <p className="rounded-md bg-warning/20 p-3 text-sm">
            <span className="font-medium">Kitchen instructions:</span> {order.kitchenInstructions}
          </p>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Order actions">
        {order.status === "DRAFT" && can(Permissions.ORDERS_CREATE) && (
          <>
            {can(Permissions.ORDERS_APPROVE) ? (
              <Button
                disabled={approve.isPending}
                onClick={() => void run(() => approve.mutateAsync(order.id))}
              >
                Send to kitchen
              </Button>
            ) : (
              <Button
                disabled={submit.isPending}
                onClick={() => void run(() => submit.mutateAsync(order.id))}
              >
                Submit for approval
              </Button>
            )}
            {can(Permissions.ORDERS_APPROVE) && (
              <Button
                variant="outline"
                disabled={submit.isPending}
                onClick={() => void run(() => submit.mutateAsync(order.id))}
              >
                Submit for approval
              </Button>
            )}
          </>
        )}
        {order.status === "PENDING_APPROVAL" && can(Permissions.ORDERS_APPROVE) && (
          <>
            <Button
              disabled={approve.isPending}
              onClick={() => void run(() => approve.mutateAsync(order.id))}
            >
              Approve
            </Button>
            <Button variant="outline" onClick={() => setDialog("reject")}>
              Return for changes
            </Button>
          </>
        )}
        {inKitchen && ready.length > 0 && can(Permissions.ORDERS_SERVE) && (
          <Button
            disabled={serve.isPending}
            onClick={() => void run(() => serve.mutateAsync({ id: order.id }))}
          >
            Serve {ready.length} ready {ready.length === 1 ? "dish" : "dishes"}
          </Button>
        )}
        {order.status === "SERVED" && can(Permissions.ORDERS_SERVE) && (
          <Button
            disabled={requestPayment.isPending}
            onClick={() => void run(() => requestPayment.mutateAsync(order.id))}
          >
            Request bill
          </Button>
        )}
        {canAdd && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add dishes
          </Button>
        )}
        {!closed && can(Permissions.ORDERS_CREATE) && (
          <Button variant="ghost" className="text-danger" onClick={() => setDialog("cancel")}>
            {isManager &&
            order.items.some((i) => ["PREPARING", "PREPARED", "SERVED"].includes(i.status))
              ? "Void order"
              : "Cancel order"}
          </Button>
        )}
      </div>

      <section aria-label="Dishes" className="space-y-4">
        {rounds.map((round) => (
          <div key={round} className="space-y-2">
            {rounds.length > 1 && (
              <h2 className="text-sm font-semibold text-muted-foreground">Round {round}</h2>
            )}
            <ul className="space-y-2">
              {order.items
                .filter((i) => i.round === round)
                .map((item) => (
                  <ItemRow
                    key={item.id}
                    order={order}
                    item={item}
                    onCancel={(i) => setDialog({ item: i })}
                  />
                ))}
            </ul>
          </div>
        ))}
        {order.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No dishes yet. Add some to continue.</p>
        )}
        <p className="flex justify-between border-t border-border pt-3 text-lg font-semibold">
          <span>Subtotal</span>
          <span>{money(order.subtotal)}</span>
        </p>
      </section>

      {order.history && (
        <section aria-label="History" className="space-y-2">
          <h2 className="font-display text-xl font-semibold">History</h2>
          <ol className="space-y-1.5 border-l-2 border-border pl-4 text-sm">
            {order.history.map((h) => (
              <li key={h.id}>
                <span className="font-medium">{ORDER_STATUS_LABELS[h.toStatus]}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatDateTime(h.createdAt, "UTC").replace(/ GMT.*/, "")}
                  {h.userName && ` · ${h.userName}`}
                  {h.note && ` — ${h.note}`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {adding && (
        <Dialog
          open
          onOpenChange={(open) => !open && setAdding(false)}
          title="Add dishes"
          description={
            inKitchen
              ? "Added dishes go straight to the kitchen as a new round."
              : "Add dishes to this draft."
          }
          size="xl"
        >
          <MenuPicker
            branchId={order.branchId}
            currency={order.currency}
            onAdd={({ item, quantity, notes, modifierIds }) =>
              void run(() =>
                addItems.mutateAsync({
                  id: order.id,
                  items: toOrderLines([{ key: "x", item, quantity, notes, modifierIds }]),
                }),
              )
            }
          />
        </Dialog>
      )}
      {dialog === "cancel" && (
        <ReasonDialog
          title={`Cancel order ${order.orderNumber}?`}
          description="Dishes the kitchen has already started can only be voided by a manager."
          confirmLabel="Cancel order"
          onClose={() => setDialog(null)}
          onConfirm={(reason) => cancel.mutateAsync({ id: order.id, reason })}
        />
      )}
      {dialog === "reject" && (
        <ReasonDialog
          title="Return for changes?"
          description="The order goes back to the waiter as a draft."
          confirmLabel="Return order"
          onClose={() => setDialog(null)}
          onConfirm={(reason) => reject.mutateAsync({ id: order.id, reason })}
        />
      )}
      {typeof dialog === "object" && dialog && (
        <ReasonDialog
          title={`Remove ${dialog.item.name}?`}
          description="The dish is taken off the order."
          confirmLabel="Remove dish"
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            cancelItem.mutateAsync({ id: order.id, itemId: dialog.item.id, reason })
          }
        />
      )}
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { data, isPending, isError, refetch } = useOrder(id);
  if (isPending) return <ListSkeleton rows={5} />;
  if (isError)
    return <ErrorState message="Couldn't load this order." onRetry={() => void refetch()} />;
  return <OrderView order={data} />;
}
