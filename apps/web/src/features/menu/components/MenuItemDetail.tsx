import { AVAILABILITY_LABELS, MEAL_PERIOD_LABELS, type MenuItemDto } from "@smartdine/shared";
import { AlertTriangle, Clock, Flame } from "lucide-react";
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { useMenuItemDetail } from "@/features/public/api/publicQueries";

import { DietTags, DishVisual, PriceTag } from "./MenuCard";

function Body({
  item,
  related,
  currency,
  onSelect,
}: {
  item: MenuItemDto;
  related: MenuItemDto[];
  currency: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="space-y-5">
      <DishVisual item={item} className="aspect-[16/9] w-full rounded-lg" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PriceTag item={item} currency={currency} />
        {!item.isAvailableNow && (
          <span role="status" className="rounded-full bg-warning/20 px-3 py-1 text-sm font-medium">
            {item.availability !== "AVAILABLE"
              ? AVAILABILITY_LABELS[item.availability]
              : `Served ${item.mealPeriods.map((p) => MEAL_PERIOD_LABELS[p].toLowerCase()).join(" & ")} only`}
          </span>
        )}
      </div>
      {item.description && <p className="text-muted-foreground">{item.description}</p>}
      <DietTags item={item} />
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {item.preparationTime !== null && (
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3.5" aria-hidden /> Preparation
            </dt>
            <dd className="font-medium">{item.preparationTime} min</dd>
          </div>
        )}
        {item.calories !== null && (
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Flame className="size-3.5" aria-hidden /> Calories
            </dt>
            <dd className="font-medium">{item.calories} kcal</dd>
          </div>
        )}
        {item.mealPeriods.length > 0 && (
          <div>
            <dt className="text-muted-foreground">Served</dt>
            <dd className="font-medium">
              {item.mealPeriods.map((p) => MEAL_PERIOD_LABELS[p]).join(", ")}
            </dd>
          </div>
        )}
      </dl>
      <section aria-labelledby="allergens-title" className="rounded-lg border border-border p-3">
        <h3 id="allergens-title" className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4" aria-hidden /> Allergens
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.allergens.length
            ? `Contains: ${item.allergens.map((a) => a.name.toLowerCase()).join(", ")}.`
            : "No listed allergens."}{" "}
          Please tell your server about any allergy.
        </p>
      </section>
      {related.length > 0 && (
        <section aria-labelledby="related-title">
          <h3 id="related-title" className="mb-2 text-sm font-semibold">
            You might also like
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.slug)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:bg-surface-muted"
                >
                  <DishVisual item={r} className="size-12 shrink-0 rounded-md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <PriceTag item={r} currency={currency} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Dish details in a dialog; related dishes swap the content in place. */
export function MenuItemDetail({
  branchId,
  initial,
  currency,
  onClose,
}: {
  branchId: string;
  initial: MenuItemDto;
  currency: string;
  onClose: () => void;
}) {
  const [slug, setSlug] = useState(initial.slug);
  const detail = useMenuItemDetail(branchId, slug);
  // Show the clicked card instantly, then upgrade to fresh data with related dishes.
  const item = detail.data?.item ?? (slug === initial.slug ? initial : undefined);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item?.name ?? initial.name}
      description={item?.categoryName}
      size="lg"
    >
      {item ? (
        <Body
          item={item}
          related={detail.data?.related ?? []}
          currency={currency}
          onSelect={setSlug}
        />
      ) : (
        <div
          role="status"
          aria-label="Loading"
          className="h-64 animate-pulse rounded-lg bg-surface-muted"
        />
      )}
    </Dialog>
  );
}
