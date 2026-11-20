import type { MenuCategoryDto } from "@smartdine/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";

import { useAdminCategories, useDeleteCategory, useSaveCategory } from "../api/menuQueries";

function Row({ category }: { category: MenuCategoryDto }) {
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <li className="space-y-1 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <input
          aria-label={`Name of ${category.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() =>
            name.trim() &&
            name !== category.name &&
            void run(() => save.mutateAsync({ id: category.id, input: { name } }))
          }
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={category.isActive}
            onChange={(e) =>
              void run(() =>
                save.mutateAsync({ id: category.id, input: { isActive: e.target.checked } }),
              )
            }
          />
          Visible
        </label>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${category.name}`}
          onClick={() => void run(() => remove.mutateAsync(category.id))}
        >
          <Trash2 className="size-4 text-danger" aria-hidden />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

export function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const { data } = useAdminCategories();
  const save = useSaveCategory();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Menu categories"
      description="Categories are shared by every branch. Hidden categories disappear from the public menu."
    >
      <form
        className="mb-4 flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!name.trim()) return;
          try {
            await save.mutateAsync({ input: { name, sortOrder: (data?.length ?? 0) * 10 + 10 } });
            setName("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
          }
        }}
      >
        <div className="flex-1">
          <TextField
            label="New category"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error ?? undefined}
          />
        </div>
        <Button type="submit" disabled={save.isPending}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </form>
      <ul className="space-y-2">
        {data?.map((c) => (
          <Row key={c.id} category={c} />
        ))}
      </ul>
      {data?.some((c) => !c.isActive) && (
        <p className="mt-3 text-xs text-muted-foreground">
          <Badge>hidden</Badge> categories are not shown to guests.
        </p>
      )}
    </Dialog>
  );
}
