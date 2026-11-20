import {
  kitchenPriority,
  type KitchenItemDto,
  type KitchenStation,
  type KitchenTicketDto,
} from "@smartdine/shared";
import { TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { titleCase } from "@/utils/format";

import { ItemStatusBadge, PriorityBadge } from "@/features/orders/components/OrderBadges";
import { useMarkTicketReady, useSetKitchenItem } from "@/features/orders/api/orderQueries";

const PRIORITY_BORDER = {
  NORMAL: "border-border",
  ATTENTION: "border-warning",
  URGENT: "border-danger",
} as const;

const formatElapsed = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Item({ item, onError }: { item: KitchenItemDto; onError: (m: string | null) => void }) {
  const set = useSetKitchenItem();
  const run = async (status: "PREPARING" | "PREPARED") => {
    onError(null);
    try {
      await set.mutateAsync({ itemId: item.id, status });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't update the dish.");
    }
  };
  const done = item.status === "PREPARED";

  return (
    <li className={cn("space-y-1.5 rounded-lg border border-border p-3", done && "bg-success/10")}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-lg leading-tight font-semibold", done && "opacity-70")}>
          {item.quantity} × {item.name}
        </p>
        <ItemStatusBadge status={item.status} />
      </div>
      {item.modifiers.length > 0 && (
        <p className="text-sm font-medium">{item.modifiers.join(" · ")}</p>
      )}
      {item.notes && <p className="rounded bg-warning/20 px-2 py-1 text-sm">Note: {item.notes}</p>}
      {item.allergens.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
          Allergens: {item.allergens.join(", ")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{titleCase(item.station)}</span>
        {item.round > 1 && (
          <span className="rounded-full bg-info/15 px-2 py-0.5 text-xs font-medium text-info">
            Added later
          </span>
        )}
        <span className="ml-auto flex gap-2">
          {item.status === "PENDING" && (
            <Button
              size="sm"
              variant="outline"
              disabled={set.isPending}
              onClick={() => void run("PREPARING")}
            >
              Start {item.name}
            </Button>
          )}
          {(item.status === "PENDING" || item.status === "PREPARING") && (
            <Button size="sm" disabled={set.isPending} onClick={() => void run("PREPARED")}>
              Ready {item.name}
            </Button>
          )}
          {done && (
            <Button
              size="sm"
              variant="ghost"
              disabled={set.isPending}
              onClick={() => void run("PREPARING")}
            >
              Recall {item.name}
            </Button>
          )}
        </span>
      </div>
    </li>
  );
}

export function TicketCard({
  ticket,
  now,
  station,
}: {
  ticket: KitchenTicketDto;
  now: number;
  station?: KitchenStation;
}) {
  const markReady = useMarkTicketReady();
  const [error, setError] = useState<string | null>(null);
  const unfinished = ticket.items.filter((i) => i.status !== "PREPARED");
  const elapsedSeconds = (now - Date.parse(ticket.sentAt)) / 1000;
  // Recomputed every second from the timestamp, so the priority escalates on screen without a refetch.
  const priority = unfinished.length ? kitchenPriority(elapsedSeconds / 60) : "NORMAL";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.25 }}
      aria-label={`Ticket ${ticket.orderNumber}, ${ticket.location}`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border-2 bg-surface p-4 shadow-sm",
        PRIORITY_BORDER[priority],
        unfinished.length === 0 && "opacity-80",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl leading-none font-semibold">{ticket.location}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            #{ticket.orderNumber} · {ticket.waiterName}
            {ticket.guestCount ? ` · ${ticket.guestCount} guests` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <time
            className="font-mono text-xl font-semibold tabular-nums"
            aria-label={`${Math.floor(elapsedSeconds / 60)} minutes elapsed`}
          >
            {formatElapsed(elapsedSeconds)}
          </time>
          {unfinished.length > 0 ? (
            <PriorityBadge priority={priority} />
          ) : (
            <span className="text-xs font-medium text-success">
              All ready — waiting for service
            </span>
          )}
        </div>
      </header>

      {ticket.kitchenInstructions && (
        <p className="rounded-md bg-warning/25 p-2.5 text-sm font-medium">
          <span className="font-semibold">Instructions:</span> {ticket.kitchenInstructions}
        </p>
      )}

      <ul className="space-y-2">
        {ticket.items.map((item) => (
          <Item key={item.id} item={item} onError={setError} />
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {unfinished.length > 1 && (
        <Button
          variant="outline"
          disabled={markReady.isPending}
          onClick={async () => {
            setError(null);
            try {
              await markReady.mutateAsync({ orderId: ticket.orderId, station });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't mark the ticket ready.");
            }
          }}
        >
          Mark all ready
        </Button>
      )}
    </motion.article>
  );
}
