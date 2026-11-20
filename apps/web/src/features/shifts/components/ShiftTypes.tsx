import { zodResolver } from "@hookform/resolvers/zod";
import { createShiftSchema, type CreateShiftInput, type ShiftDto } from "@smartdine/shared";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ListSkeleton } from "@/components/feedback/EmptyState";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";

import { useDeleteShift, useSaveShift, useShifts } from "../api/shiftQueries";

function ShiftDialog({ shift, onClose }: { shift?: ShiftDto; onClose: () => void }) {
  const save = useSaveShift();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateShiftInput>({
    resolver: zodResolver(createShiftSchema),
    defaultValues: shift ?? { startTime: "06:00", endTime: "14:00" },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={shift ? "Edit shift type" : "New shift type"}
      description="A shift ending before it starts runs past midnight."
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (input) => {
          setError(null);
          try {
            await save.mutateAsync({ id: shift?.id, input });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        })}
      >
        <FormError message={error} />
        <TextField label="Name" error={errors.name?.message} {...register("name")} />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Starts"
            type="time"
            error={errors.startTime?.message}
            {...register("startTime")}
          />
          <TextField
            label="Ends"
            type="time"
            error={errors.endTime?.message}
            {...register("endTime")}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ShiftTypes() {
  const { data, isPending } = useShifts();
  const remove = useDeleteShift();
  const [editing, setEditing] = useState<ShiftDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<ShiftDto | null>(null);

  if (isPending) return <ListSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing("new")}>
        <Plus className="size-4" aria-hidden /> New shift type
      </Button>
      {!data?.length ? (
        <EmptyState
          icon={Clock}
          title="No shift types"
          text="Create Morning, Evening or Night shifts to build the schedule."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((shift) => (
            <li
              key={shift.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
            >
              <div>
                <p className="font-medium">{shift.name}</p>
                <p className="text-sm text-muted-foreground">
                  {shift.startTime} – {shift.endTime}
                </p>
              </div>
              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${shift.name}`}
                  onClick={() => setEditing(shift)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${shift.name}`}
                  onClick={() => setDeleting(shift)}
                >
                  <Trash2 className="size-4 text-danger" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ShiftDialog
          key={editing === "new" ? "new" : editing.id}
          shift={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "shift"}?`}
        description="Shift types that are already scheduled cannot be deleted."
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </div>
  );
}
