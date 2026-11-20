import { Permissions, type OrderDto } from "@smartdine/shared";
import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { cn } from "@/lib/utils";
import { formatMoney, formatTime } from "@/utils/format";

import { useLiveOrders, useOrders } from "../api/orderQueries";
import { OrderStatusBadge } from "../components/OrderBadges";

function OrderCard({ order }: { order: OrderDto }) {
  const done = order.items.filter((i) => i.status === "SERVED").length;
  const live = order.items.filter((i) => i.status !== "CANCELLED").length;
  return (
    <li>
      <Link
        to={`/app/orders/${order.id}`}
        className="block space-y-1.5 rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            {order.orderNumber} ·{" "}
            {order.type === "DINE_IN" ? `Table ${order.tableNumber}` : `Room ${order.roomNumber}`}
          </p>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {live} {live === 1 ? "dish" : "dishes"} · {done} served ·{" "}
          {formatMoney(order.subtotal, order.currency)} · {order.waiterName} ·{" "}
          {order.selfOrdered && "Guest order · "}
          {formatTime(order.createdAt, "UTC")}
        </p>
      </Link>
    </li>
  );
}

function Orders({ branchId }: { branchId: string }) {
  const { can } = useAuth();
  const [scope, setScope] = useState<"active" | "history">("active");
  const { data, isPending, isError, refetch } = useOrders(branchId, scope);
  useLiveOrders(branchId);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Live orders for this branch. Updates as the kitchen and floor work."
        actions={
          can(Permissions.ORDERS_CREATE) && (
            <Link
              to="/app/orders/new"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" aria-hidden /> New order
            </Link>
          )
        }
      />
      <div
        role="tablist"
        aria-label="Order scope"
        className="mb-4 flex gap-1 border-b border-border"
      >
        {(["active", "history"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize",
              scope === s
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load orders." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={scope === "active" ? "No open orders" : "No past orders yet"}
          text={
            scope === "active"
              ? "Orders appear here as soon as they're created."
              : "Completed and cancelled orders will be listed here."
          }
        />
      )}
      <ul className="grid gap-2 lg:grid-cols-2">
        {data?.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
      </ul>
    </>
  );
}

export function OrdersListPage() {
  return <BranchRequired>{(branchId) => <Orders branchId={branchId} />}</BranchRequired>;
}
