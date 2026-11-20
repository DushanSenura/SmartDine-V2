import { Permissions, type OrderDto } from "@smartdine/shared";
import { BellRing, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import {
  useApproveOrder,
  useLiveOrders,
  useOrders,
  useRequestPayment,
  useServeItems,
} from "@/features/orders/api/orderQueries";
import { OrderStatusBadge } from "@/features/orders/components/OrderBadges";
import { GuestRequests } from "../components/GuestRequests";
import { ClockCard } from "@/features/shifts/components/ClockCard";

const where = (o: OrderDto) =>
  o.type === "DINE_IN" ? `Table ${o.tableNumber}` : `Room ${o.roomNumber}`;

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nothing here right now.
        </p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

function Row({ order, children }: { order: OrderDto; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
      <Link to={`/app/orders/${order.id}`} className="min-w-0 space-y-0.5">
        <p className="font-medium">
          {where(order)} · {order.orderNumber}
        </p>
        <OrderStatusBadge status={order.status} />
      </Link>
      {children}
    </li>
  );
}

function Dashboard({ branchId }: { branchId: string }) {
  const { can } = useAuth();
  const { data, isPending, isError, refetch } = useOrders(branchId, "active");
  const approve = useApproveOrder();
  const serve = useServeItems();
  const requestPayment = useRequestPayment();
  const [error, setError] = useState<string | null>(null);
  useLiveOrders(branchId);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const orders = data ?? [];
  const pending = orders.filter((o) => o.status === "PENDING_APPROVAL");
  const ready = orders.filter((o) => o.items.some((i) => i.status === "PREPARED"));
  const cooking = orders.filter((o) =>
    ["SENT_TO_KITCHEN", "PREPARING", "PARTIALLY_READY"].includes(o.status),
  );
  const toBill = orders.filter((o) => o.status === "SERVED");
  const billed = orders.filter((o) => o.status === "PAYMENT_REQUESTED");

  return (
    <>
      <PageHeader
        title="Service"
        description="Your floor at a glance. Updates live as the kitchen works."
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
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load orders." onRetry={() => void refetch()} />}
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Ready to serve" count={ready.length}>
            {ready.map((o) => (
              <Row key={o.id} order={o}>
                <Button
                  size="sm"
                  disabled={serve.isPending}
                  onClick={() =>
                    void run(() =>
                      serve.mutateAsync({
                        id: o.id,
                        itemIds: o.items.filter((i) => i.status === "PREPARED").map((i) => i.id),
                      }),
                    )
                  }
                >
                  <BellRing className="size-4" aria-hidden /> Serve {where(o)}
                </Button>
              </Row>
            ))}
          </Section>
          <Section title="Needs approval" count={pending.length}>
            {pending.map((o) => (
              <Row key={o.id} order={o}>
                {can(Permissions.ORDERS_APPROVE) && (
                  <Button
                    size="sm"
                    disabled={approve.isPending}
                    onClick={() => void run(() => approve.mutateAsync(o.id))}
                  >
                    Approve {where(o)}
                  </Button>
                )}
              </Row>
            ))}
          </Section>
          <Section title="In the kitchen" count={cooking.length}>
            {cooking.map((o) => (
              <Row key={o.id} order={o} />
            ))}
          </Section>
          <Section title="Ready for the bill" count={toBill.length}>
            {toBill.map((o) => (
              <Row key={o.id} order={o}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={requestPayment.isPending}
                  onClick={() => void run(() => requestPayment.mutateAsync(o.id))}
                >
                  Request bill {where(o)}
                </Button>
              </Row>
            ))}
          </Section>
          <Section title="Bill requested" count={billed.length}>
            {billed.map((o) => (
              <Row key={o.id} order={o} />
            ))}
          </Section>
          <GuestRequests branchId={branchId} />
        </div>
      )}
      <div className="mt-6 max-w-md">
        <ClockCard />
      </div>
    </>
  );
}

export function WaiterDashboard() {
  return <BranchRequired>{(branchId) => <Dashboard branchId={branchId} />}</BranchRequired>;
}
