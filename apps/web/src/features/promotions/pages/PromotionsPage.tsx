import { PROMOTION_TYPE_LABELS, type PromotionDto } from "@smartdine/shared";
import { Plus, Tag } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, formatMoney } from "@/utils/format";

import { useArchivePromotion, usePromotions } from "../api/promotionQueries";
import { PromotionDialog } from "../components/PromotionDialog";

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function summary(p: PromotionDto) {
  const value =
    p.type === "PERCENTAGE" || p.type === "HAPPY_HOUR"
      ? `${p.value}% off`
      : p.type === "FIXED"
        ? `${formatMoney(p.value, "LKR")} off`
        : p.type === "LOYALTY_MULTIPLIER"
          ? `${p.value}× points`
          : null;
  const when = [
    p.daysOfWeek.length > 0 ? p.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ") : null,
    p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : null,
    p.startsOn || p.endsOn
      ? `${p.startsOn ? formatDate(p.startsOn) : "…"} → ${p.endsOn ? formatDate(p.endsOn) : "…"}`
      : null,
  ].filter(Boolean);
  return [value, ...when].filter(Boolean).join(" · ");
}

export function PromotionsPage() {
  const { data, isPending, isError, refetch } = usePromotions();
  const archive = useArchivePromotion();
  const [editing, setEditing] = useState<PromotionDto | "new" | null>(null);
  const [archiving, setArchiving] = useState<PromotionDto | null>(null);

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Promo codes, happy hours, points multipliers and seasonal offers."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> New promotion
          </Button>
        }
      />
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load promotions." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={Tag}
          title="No promotions yet"
          text="Create a promo code for the till, a happy hour, or an offer to show on the website."
          action={<Button onClick={() => setEditing("new")}>New promotion</Button>}
        />
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {data?.map((p) => (
          <li key={p.id} className="space-y-2 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{p.name}</p>
              <span className="flex gap-1.5">
                {p.live ? (
                  <Badge tone="success">Live</Badge>
                ) : (
                  <Badge tone="neutral">{p.active ? "Not running" : "Inactive"}</Badge>
                )}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {PROMOTION_TYPE_LABELS[p.type]}
              {summary(p) && ` · ${summary(p)}`}
            </p>
            {p.code && (
              <p className="text-sm">
                Code{" "}
                <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">
                  {p.code}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · used {p.usedCount}
                  {p.usageLimit ? ` of ${p.usageLimit}` : ""}
                </span>
              </p>
            )}
            {p.minimumSpend > 0 && (
              <p className="text-xs text-muted-foreground">
                Minimum spend {formatMoney(p.minimumSpend, "LKR")}
              </p>
            )}
            {p.customerIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Restricted to {p.customerIds.length} customer(s)
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label={`Edit ${p.name}`}
                onClick={() => setEditing(p)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                aria-label={`Archive ${p.name}`}
                onClick={() => setArchiving(p)}
              >
                Archive
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <PromotionDialog
          promotion={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={`Archive ${archiving?.name ?? "this promotion"}?`}
        description="It stops working immediately and its code is freed. Bills that already used it are unaffected."
        confirmLabel="Archive"
        onConfirm={() => archive.mutateAsync(archiving!.id)}
      />
    </>
  );
}
