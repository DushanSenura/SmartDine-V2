import { AVAILABILITY_LABELS, type MenuItemDto } from "@smartdine/shared";
import { Clock, Flame, Leaf, UtensilsCrossed } from "lucide-react";
import { motion } from "motion/react";

import { FavouriteButton } from "@/features/customers/components/FavouriteButton";
import { AddToOrder } from "@/features/ordering/components/AddToOrder";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/format";

export function DietTags({ item, className }: { item: MenuItemDto; className?: string }) {
  const tags: { label: string; icon?: typeof Leaf }[] = [];
  if (item.vegan) tags.push({ label: "Vegan", icon: Leaf });
  else if (item.vegetarian) tags.push({ label: "Vegetarian", icon: Leaf });
  if (item.halal) tags.push({ label: "Halal" });
  if (item.spiceLevel > 0) {
    tags.push({ label: ["", "Mild", "Medium", "Hot"][item.spiceLevel] ?? "Spicy", icon: Flame });
  }
  if (!tags.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Dietary information">
      {tags.map(({ label, icon: Icon }) => (
        <li
          key={label}
          className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium"
        >
          {Icon && <Icon className="size-3" aria-hidden />}
          {label}
        </li>
      ))}
    </ul>
  );
}

export function DishVisual({ item, className }: { item: MenuItemDto; className?: string }) {
  if (item.image) {
    return (
      <img
        src={item.image}
        alt={item.name}
        loading="lazy"
        className={cn("object-cover", className)}
      />
    );
  }
  // No photo yet: a calm placeholder that still reads as a dish.
  return (
    <div
      aria-hidden
      className={cn(
        "grid place-items-center bg-gradient-to-br from-primary/25 via-primary/10 to-accent/35",
        className,
      )}
    >
      <UtensilsCrossed className="size-10 text-primary/40" />
    </div>
  );
}

export function PriceTag({ item, currency }: { item: MenuItemDto; currency: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-base font-semibold">{formatMoney(item.price, currency)}</span>
      {item.comparePrice !== null && item.discountPercent !== null && (
        <>
          <s className="text-sm text-muted-foreground">
            {formatMoney(item.comparePrice, currency)}
          </s>
          <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
            −{item.discountPercent}%
          </span>
        </>
      )}
    </p>
  );
}

export function MenuCard({
  item,
  currency,
  onOpen,
  ordering,
}: {
  item: MenuItemDto;
  currency: string;
  onOpen: () => void;
  /** Present when the signed-in guest can order from their table. */
  ordering?: { qty: number; onChange: (qty: number) => void };
}) {
  const unavailable = !item.isAvailableNow;
  const reason =
    item.availability !== "AVAILABLE"
      ? AVAILABILITY_LABELS[item.availability]
      : `Served ${item.mealPeriods.map((p) => p.toLowerCase()).join(" & ")} only`;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="relative"
    >
      <button
        type="button"
        onClick={onOpen}
        className="group flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border bg-surface text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      >
        <div className="relative overflow-hidden">
          <DishVisual
            item={item}
            className={cn(
              "aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-105",
              unavailable && "opacity-50 grayscale",
            )}
          />
          <div className="absolute top-2 left-2 flex gap-1.5">
            {item.newItem && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground shadow">
                New
              </span>
            )}
            {item.popular && (
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow">
                Popular
              </span>
            )}
          </div>
          {unavailable && (
            <span className="absolute right-2 bottom-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium">
              {reason}
            </span>
          )}
        </div>
        <div className={cn("flex flex-1 flex-col gap-2 p-5", ordering && !unavailable && "pb-16")}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg leading-snug font-semibold group-hover:text-primary">
              {item.name}
            </h3>
          </div>
          {item.shortDescription && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{item.shortDescription}</p>
          )}
          <DietTags item={item} />
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <PriceTag item={item} currency={currency} />
            {item.preparationTime !== null && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" aria-hidden /> {item.preparationTime} min
              </span>
            )}
          </div>
        </div>
      </button>
      <FavouriteButton menuItemId={item.id} name={item.name} />
      {ordering && !unavailable && (
        <div className="absolute right-4 bottom-4">
          <AddToOrder name={item.name} qty={ordering.qty} onChange={ordering.onChange} />
        </div>
      )}
    </motion.li>
  );
}
