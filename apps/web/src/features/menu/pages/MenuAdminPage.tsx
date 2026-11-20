import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STATUSES,
  Permissions,
  type AvailabilityStatus,
  type MenuItemDto,
} from "@smartdine/shared";
import { Pencil, Plus, Search, Tags, Trash2, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { formatMoney } from "@/utils/format";

import {
  useAdminMenu,
  useDeleteMenuItem,
  useLiveMenu,
  useSetAvailability,
} from "../api/menuQueries";
import { CategoriesDialog } from "../components/CategoriesDialog";
import { DishVisual } from "../components/MenuCard";
import { MenuItemFormDialog } from "../components/MenuItemFormDialog";

function Dishes({ branchId }: { branchId: string }) {
  const { can } = useAuth();
  const canManage = can(Permissions.MENU_MANAGE);
  const { branch } = useCurrentBranch();
  const currency = branch?.currency ?? "LKR";
  const { data, isPending, isError, refetch } = useAdminMenu(branchId);
  const setAvailability = useSetAvailability();
  const remove = useDeleteMenuItem();
  useLiveMenu(branchId);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MenuItemDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<MenuItemDto | null>(null);
  const [categories, setCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (i) => !q || i.name.toLowerCase().includes(q) || i.categoryName.toLowerCase().includes(q),
    );
  }, [data, search]);

  const changeAvailability = async (item: MenuItemDto, availability: AvailabilityStatus) => {
    setError(null);
    try {
      await setAvailability.mutateAsync({ id: item.id, availability });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update availability.");
    }
  };

  return (
    <>
      <PageHeader
        title={canManage ? "Menu" : "Dish availability"}
        description={
          canManage
            ? "Dishes, prices and availability. Availability changes appear on every screen instantly."
            : "Mark dishes sold out or back on. Changes appear on every screen instantly."
        }
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setCategories(true)}>
                <Tags className="size-4" aria-hidden /> Categories
              </Button>
              <Button onClick={() => setEditing("new")}>
                <Plus className="size-4" aria-hidden /> New dish
              </Button>
            </>
          )
        }
      />

      <label className="relative mb-4 block max-w-sm">
        <span className="sr-only">Search dishes</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dishes or categories"
          className="h-10 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load the menu." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={UtensilsCrossed}
          title="No dishes yet"
          text={
            canManage ? "Add your first dish to publish the menu." : "Ask a manager to add dishes."
          }
          action={
            canManage ? <Button onClick={() => setEditing("new")}>Add a dish</Button> : undefined
          }
        />
      )}
      {data && data.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No dishes match “{search}”.</p>
      )}

      <ul className="space-y-2">
        {filtered.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"
          >
            <DishVisual item={item} className="size-14 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {item.name}
                {item.featured && <Badge tone="info">featured</Badge>}
                {item.newItem && <Badge tone="success">new</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.categoryName} · {formatMoney(item.price, currency)}
                {canManage &&
                  item.costPrice != null &&
                  ` · cost ${formatMoney(item.costPrice, currency)}`}
              </p>
            </div>
            <label className="text-sm">
              <span className="sr-only">Availability of {item.name}</span>
              <select
                value={item.availability}
                disabled={setAvailability.isPending}
                onChange={(e) =>
                  void changeAvailability(item, e.target.value as AvailabilityStatus)
                }
                className={`h-9 rounded-md border bg-surface px-2 text-sm ${item.availability === "AVAILABLE" ? "border-border" : "border-warning"}`}
              >
                {AVAILABILITY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {AVAILABILITY_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            {canManage && (
              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${item.name}`}
                  onClick={() => setEditing(item)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => setDeleting(item)}
                >
                  <Trash2 className="size-4 text-danger" aria-hidden />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <MenuItemFormDialog
          key={editing === "new" ? "new" : editing.id}
          branchId={branchId}
          item={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {categories && <CategoriesDialog onClose={() => setCategories(false)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "dish"}?`}
        description="It disappears from the menu. Past orders keep their record."
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  );
}

export function MenuAdminPage() {
  return <BranchRequired>{(branchId) => <Dishes branchId={branchId} />}</BranchRequired>;
}
