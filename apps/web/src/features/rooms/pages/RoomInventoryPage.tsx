import { zodResolver } from "@hookform/resolvers/zod";
import {
  createRoomSchema,
  HOUSEKEEPING_LABELS,
  MANUAL_ROOM_STATUSES,
  ROOM_STATUS_LABELS,
  updateRoomSchema,
  type CreateRoomInput,
  type RoomDto,
  type RoomStatus,
} from "@smartdine/shared";
import { DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField, TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { BranchRequired } from "@/features/branches/components/BranchRequired";

import {
  useAdminRoomTypes,
  useDeleteRoom,
  useLiveRooms,
  useRooms,
  useSaveRoom,
  useSetRoomStatus,
} from "../api/roomQueries";

const STATUS_TONES: Record<RoomStatus, "success" | "warning" | "info" | "neutral" | "danger"> = {
  AVAILABLE: "success",
  RESERVED: "info",
  OCCUPIED: "info",
  CLEANING: "warning",
  MAINTENANCE: "danger",
  OUT_OF_SERVICE: "danger",
};

function RoomDialog({
  branchId,
  room,
  onClose,
}: {
  branchId: string;
  room?: RoomDto;
  onClose: () => void;
}) {
  const types = useAdminRoomTypes(branchId);
  const save = useSaveRoom();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateRoomInput>({
    resolver: zodResolver(
      (room ? updateRoomSchema : createRoomSchema) as typeof createRoomSchema,
    ) as never,
    defaultValues: room
      ? {
          roomNumber: room.roomNumber,
          roomTypeId: room.roomTypeId,
          floor: room.floor,
          notes: room.notes,
        }
      : { branchId, floor: 1 },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={room ? `Edit room ${room.roomNumber}` : "New room"}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (input) => {
          setError(null);
          try {
            await save.mutateAsync({ id: room?.id, input });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        })}
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Room number"
            error={errors.roomNumber?.message}
            {...register("roomNumber")}
          />
          <TextField
            label="Floor"
            type="number"
            error={errors.floor?.message}
            {...register("floor", { valueAsNumber: true })}
          />
        </div>
        <SelectField
          label="Room type"
          placeholder="Choose…"
          options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          error={errors.roomTypeId?.message}
          {...register("roomTypeId")}
        />
        <TextAreaField
          label="Notes"
          {...register("notes", { setValueAs: (v: string) => (v === "" ? null : v) })}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save room"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Inventory({ branchId }: { branchId: string }) {
  const { data, isPending, isError, refetch } = useRooms(branchId);
  const setStatus = useSetRoomStatus();
  const remove = useDeleteRoom();
  const [editing, setEditing] = useState<RoomDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<RoomDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useLiveRooms(branchId);

  const floors = useMemo(() => {
    const map = new Map<number, RoomDto[]>();
    for (const room of data ?? []) map.set(room.floor, [...(map.get(room.floor) ?? []), room]);
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [data]);

  return (
    <>
      <PageHeader
        title="Room inventory"
        description="Every physical room, its state and housekeeping status."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> New room
          </Button>
        }
      />
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load rooms." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={DoorOpen}
          title="No rooms yet"
          text="Create a room type first, then add its rooms here."
          action={<Button onClick={() => setEditing("new")}>Add a room</Button>}
        />
      )}

      {floors.map(([floor, rooms]) => (
        <section key={floor} aria-label={`Floor ${floor}`} className="mb-8 space-y-3">
          <h2 className="font-display text-xl font-semibold">Floor {floor}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => {
              const manualStatus = (MANUAL_ROOM_STATUSES as readonly string[]).includes(
                room.status,
              );
              return (
                <li
                  key={room.id}
                  className="space-y-3 rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-xl font-semibold">{room.roomNumber}</p>
                      <p className="text-sm text-muted-foreground">{room.roomTypeName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={STATUS_TONES[room.status]}>
                        {ROOM_STATUS_LABELS[room.status]}
                      </Badge>
                      <Badge tone={room.housekeepingStatus === "CLEAN" ? "success" : "warning"}>
                        {HOUSEKEEPING_LABELS[room.housekeepingStatus]}
                      </Badge>
                    </div>
                  </div>
                  {room.currentGuest && (
                    <p className="text-sm">
                      Guest: <span className="font-medium">{room.currentGuest}</span>
                    </p>
                  )}
                  {room.reservedToday && <p className="text-sm text-info">Arrival due today</p>}
                  {room.notes && <p className="text-sm text-muted-foreground">{room.notes}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm">
                      <span className="sr-only">Status of room {room.roomNumber}</span>
                      <select
                        value={manualStatus ? room.status : ""}
                        disabled={room.status === "OCCUPIED" || setStatus.isPending}
                        onChange={async (e) => {
                          setError(null);
                          try {
                            await setStatus.mutateAsync({
                              id: room.id,
                              status: e.target.value as RoomStatus,
                            });
                          } catch (err) {
                            setError(
                              err instanceof Error ? err.message : "Couldn't change the status.",
                            );
                          }
                        }}
                        className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                      >
                        {!manualStatus && (
                          <option value="">{ROOM_STATUS_LABELS[room.status]}</option>
                        )}
                        {MANUAL_ROOM_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ROOM_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit room ${room.roomNumber}`}
                        onClick={() => setEditing(room)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete room ${room.roomNumber}`}
                        onClick={() => setDeleting(room)}
                      >
                        <Trash2 className="size-4 text-danger" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editing && (
        <RoomDialog
          key={editing === "new" ? "new" : editing.id}
          branchId={branchId}
          room={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete room ${deleting?.roomNumber ?? ""}?`}
        description="Rooms with current or upcoming bookings cannot be deleted."
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  );
}

export function RoomInventoryPage() {
  return <BranchRequired>{(branchId) => <Inventory branchId={branchId} />}</BranchRequired>;
}
