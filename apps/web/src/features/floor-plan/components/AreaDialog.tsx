import { zodResolver } from "@hookform/resolvers/zod";
import {
  createDiningAreaSchema,
  type CreateDiningAreaInput,
  type DiningAreaDto,
} from "@smartdine/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";

import { useDeleteArea, useSaveArea } from "../api/floorQueries";

const num = { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) };

export function AreaDialog({
  branchId,
  area,
  onClose,
  onSaved,
}: {
  branchId: string;
  area?: DiningAreaDto;
  onClose: () => void;
  onSaved?: (area: DiningAreaDto) => void;
}) {
  const save = useSaveArea();
  const remove = useDeleteArea();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateDiningAreaInput>({
    resolver: zodResolver(createDiningAreaSchema) as never,
    defaultValues: area ?? { branchId, floor: 1, width: 1200, height: 700, isActive: true },
  });

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={area ? "Edit area" : "New floor / area"}
        description="A floor or dining zone with its own floor plan canvas."
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (input) => {
            setError(null);
            try {
              const { branchId: _ignored, ...update } = input;
              const saved = await save.mutateAsync({ id: area?.id, input: area ? update : input });
              onSaved?.(saved);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong.");
            }
          })}
        >
          <FormError message={error} />
          <TextField label="Name" error={errors.name?.message} {...register("name")} />
          <div className="grid grid-cols-3 gap-4">
            <TextField
              label="Floor"
              type="number"
              error={errors.floor?.message}
              {...register("floor", num)}
            />
            <TextField
              label="Width (px)"
              type="number"
              error={errors.width?.message}
              {...register("width", num)}
            />
            <TextField
              label="Height (px)"
              type="number"
              error={errors.height?.message}
              {...register("height", num)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              {...register("isActive")}
            />
            Area is available for seating
          </label>
          <div className="flex justify-between gap-2 pt-2">
            {area ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete area
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save area"}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
      {area && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${area.name}?`}
          description="Only empty areas can be deleted. Remove or move its tables first."
          onConfirm={async () => {
            await remove.mutateAsync(area.id);
            onClose();
          }}
        />
      )}
    </>
  );
}
