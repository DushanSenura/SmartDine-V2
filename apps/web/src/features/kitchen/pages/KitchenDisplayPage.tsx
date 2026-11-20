import { KITCHEN_STATIONS, type KitchenStation } from "@smartdine/shared";
import { ChefHat, Maximize2, Minimize2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useKitchenTickets, useLiveOrders } from "@/features/orders/api/orderQueries";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";
import { titleCase } from "@/utils/format";

import { TicketCard } from "../components/TicketCard";

function Display({ branchId }: { branchId: string }) {
  const [station, setStation] = useState<KitchenStation | undefined>();
  const [fullscreen, setFullscreen] = useState(false);
  const { data, isPending, isError, refetch } = useKitchenTickets(branchId, station);
  const now = useNow(1000);
  useLiveOrders(branchId);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Tickets with work left first (oldest first); fully-ready tickets drop to the bottom.
  const tickets = useMemo(() => {
    const open = (t: NonNullable<typeof data>[number]) =>
      t.items.some((i) => i.status !== "PREPARED");
    return [...(data ?? [])].sort(
      (a, b) => Number(open(b)) - Number(open(a)) || Date.parse(a.sentAt) - Date.parse(b.sentAt),
    );
  }, [data]);

  const toggleFullscreen = () =>
    void (document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen());

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Kitchen</h1>
          <p className="text-sm text-muted-foreground" role="status">
            {data
              ? `${tickets.length} open ${tickets.length === 1 ? "ticket" : "tickets"}`
              : "Loading tickets…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Station" className="flex flex-wrap gap-1">
            {([undefined, ...KITCHEN_STATIONS] as const).map((s) => (
              <button
                key={s ?? "all"}
                type="button"
                aria-pressed={station === s}
                onClick={() => setStation(s)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  station === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-surface-muted",
                )}
              >
                {s ? titleCase(s) : "All stations"}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={toggleFullscreen}
          >
            {fullscreen ? (
              <Minimize2 className="size-4" aria-hidden />
            ) : (
              <Maximize2 className="size-4" aria-hidden />
            )}
          </Button>
        </div>
      </header>

      {isPending && <ListSkeleton rows={3} />}
      {isError && <ErrorState message="Couldn't load tickets." onRetry={() => void refetch()} />}
      {data && tickets.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-20 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-success/15 text-success">
            <ChefHat className="size-7" aria-hidden />
          </span>
          <p className="font-display text-2xl font-semibold">No orders waiting</p>
          <p className="text-muted-foreground">
            The kitchen is all caught up{station ? ` at ${titleCase(station)}` : ""}.
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.orderId} ticket={ticket} now={now} station={station} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function KitchenDisplayPage() {
  return <BranchRequired>{(branchId) => <Display branchId={branchId} />}</BranchRequired>;
}
