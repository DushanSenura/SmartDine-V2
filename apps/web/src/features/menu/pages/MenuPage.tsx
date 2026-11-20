import type { MenuItemDto } from "@smartdine/shared";
import { Leaf, Search, SearchX, ShoppingBag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { OrderPanel } from "@/features/ordering/components/OrderPanel";
import { useOrderCart } from "@/features/ordering/hooks/useOrderCart";
import { usePublicMenu, type MenuFilters } from "@/features/public/api/publicQueries";
import { BranchPicker } from "@/features/public/components/BranchPicker";
import { PageIntro } from "@/features/public/components/PageIntro";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { cn } from "@/lib/utils";

import { MenuCard } from "../components/MenuCard";
import { MenuItemDetail } from "../components/MenuItemDetail";

const FILTERS: { key: keyof MenuFilters; label: string }[] = [
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "halal", label: "Halal" },
  { key: "spicy", label: "Spicy" },
  { key: "featured", label: "Featured" },
  { key: "popular", label: "Popular" },
  { key: "isNew", label: "New" },
];

function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function CardSkeletons() {
  return (
    <ul
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading menu"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="aspect-[4/3] animate-pulse bg-surface-muted motion-reduce:animate-none" />
          <div className="space-y-2 p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
            <div className="h-4 w-full animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MenuPage() {
  const { branch, currency } = usePublicBranch();
  const { user, status } = useAuth();
  const orderCart = useOrderCart();
  // Signed-in customers can order from their table right here; everyone else just browses.
  const canOrder = user?.role === "CUSTOMER";
  const [search, setSearch] = useState("");
  const [flags, setFlags] = useState<Partial<Record<keyof MenuFilters, boolean>>>({});
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuItemDto | null>(null);
  const q = useDebounced(search.trim());

  const filters: MenuFilters = { ...flags, q: q || undefined };
  const { data, isPending, isError, refetch } = usePublicMenu(branch?.id, filters);

  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (i) => !category || data?.categories.find((c) => c.slug === category)?.id === i.categoryId,
      ),
    [data, category],
  );
  const grouped = useMemo(() => {
    const byCategory = new Map<string, MenuItemDto[]>();
    for (const item of items)
      byCategory.set(item.categoryName, [...(byCategory.get(item.categoryName) ?? []), item]);
    return [...byCategory.entries()];
  }, [items]);
  const filtering = !!q || Object.values(flags).some(Boolean) || !!category;

  return (
    <>
      <PageIntro
        eyebrow="Our menu"
        title="Made to be shared"
        text="Browse the full menu, filter by diet and check allergens. Dining with us? Sign in, add dishes and order straight from your table."
      >
        <BranchPicker className="mt-2 md:hidden" />
      </PageIntro>

      <div
        className={cn(
          "mx-auto max-w-6xl gap-8 px-4 sm:px-6",
          canOrder && "grid pb-24 lg:grid-cols-[1fr_21rem] lg:pb-0",
        )}
      >
        <div className="min-w-0 space-y-6">
          {status !== "loading" && !user && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
              <ShoppingBag className="size-4 text-primary" aria-hidden />
              <span>Dining with us? Sign in to order from your table.</span>
              <Link
                to="/login"
                state={{ from: "/menu" }}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          )}
          <div className="space-y-4">
            <label className="relative block max-w-md">
              <span className="sr-only">Search dishes</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes, ingredients…"
                className="h-11 w-full rounded-full border border-border bg-surface pr-4 pl-10 text-sm"
              />
            </label>

            <div role="group" aria-label="Dietary filters" className="flex flex-wrap gap-2">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={!!flags[key]}
                  onClick={() => setFlags((f) => ({ ...f, [key]: !f[key] }))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    flags[key]
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface hover:bg-surface-muted",
                  )}
                >
                  {(key === "vegan" || key === "vegetarian") && (
                    <Leaf className="size-3.5" aria-hidden />
                  )}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {data && data.categories.length > 0 && (
            <div
              role="tablist"
              aria-label="Categories"
              className="sticky top-16 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0"
            >
              {[{ slug: null as string | null, name: "All" }, ...data.categories].map((c) => (
                <button
                  key={c.slug ?? "all"}
                  role="tab"
                  aria-selected={category === c.slug}
                  onClick={() => setCategory(c.slug)}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    category === c.slug
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {isPending && <CardSkeletons />}
          {isError && (
            <ErrorState message="We couldn't load the menu." onRetry={() => void refetch()} />
          )}

          {data && items.length === 0 && (
            <EmptyState
              icon={filtering ? SearchX : Search}
              title={filtering ? "No dishes match your filters" : "The menu is being prepared"}
              text={
                filtering
                  ? "Try removing a filter or searching for something else."
                  : "Please check back soon."
              }
              action={
                filtering ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setFlags({});
                      setCategory(null);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}

          {grouped.map(([name, list]) => (
            <section key={name} aria-labelledby={`cat-${name}`} className="space-y-4">
              <h2 id={`cat-${name}`} className="font-display text-2xl font-semibold">
                {name}
              </h2>
              <ul
                className={cn(
                  "grid gap-5 sm:grid-cols-2",
                  canOrder ? "xl:grid-cols-2 2xl:grid-cols-3" : "lg:grid-cols-3",
                )}
              >
                <AnimatePresence mode="popLayout">
                  {list.map((item) => (
                    <MenuCard
                      key={item.id}
                      item={item}
                      currency={currency}
                      onOpen={() => setSelected(item)}
                      ordering={
                        canOrder
                          ? {
                              qty: orderCart.cart[item.id] ?? 0,
                              onChange: (qty) => orderCart.setQty(item.id, qty),
                            }
                          : undefined
                      }
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-4 text-center text-sm text-muted-foreground"
          >
            Prices are per dish. Some dishes are only served at certain times of day.
          </motion.p>
        </div>
        {canOrder && <OrderPanel cart={orderCart} />}
      </div>

      {canOrder && orderCart.count > 0 && (
        <a
          href="#your-order"
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg lg:hidden"
        >
          <span>
            {orderCart.count} {orderCart.count === 1 ? "dish" : "dishes"} in your order
          </span>
          <span>Review and send</span>
        </a>
      )}

      {selected && branch && (
        <MenuItemDetail
          branchId={branch.id}
          initial={selected}
          currency={currency}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
