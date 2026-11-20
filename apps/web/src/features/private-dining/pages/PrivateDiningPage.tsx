import type { PrivateRoomDto } from "@smartdine/shared";
import { Pencil, Plus, Trash2, Users2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";

import { useDeletePrivateRoom, usePrivateRooms } from "../api/privateDiningQueries";
import { PrivateRoomDialog } from "../components/PrivateRoomDialog";

function RoomList({ branchId }: { branchId: string }) {
  const { branch } = useCurrentBranch();
  const { data, isPending, isError, refetch } = usePrivateRooms(branchId);
  const remove = useDeletePrivateRoom();
  const [editing, setEditing] = useState<PrivateRoomDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<PrivateRoomDto | null>(null);
  const money = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: branch?.currency ?? "LKR",
    maximumFractionDigits: 0,
  });

  return (
    <>
      <PageHeader
        title="Private dining"
        description="Rooms customers can book for celebrations and business dinners."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> New room
          </Button>
        }
      />
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load rooms." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={Users2}
          title="No private dining rooms"
          text="Add a room with its capacity, minimum spend and deposit."
          action={<Button onClick={() => setEditing("new")}>Add a room</Button>}
        />
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {data?.map((room) => (
          <li key={room.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {room.name}
                  {!room.isActive && <Badge tone="warning">inactive</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {room.minimumGuests}–{room.maximumGuests} guests · capacity {room.capacity}
                </p>
              </div>
              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${room.name}`}
                  onClick={() => setEditing(room)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${room.name}`}
                  onClick={() => setDeleting(room)}
                >
                  <Trash2 className="size-4 text-danger" aria-hidden />
                </Button>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Min. spend</dt>
                <dd className="font-medium">{money.format(room.minimumSpend)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Per hour</dt>
                <dd className="font-medium">{money.format(room.hourlyRate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Deposit</dt>
                <dd className="font-medium">{money.format(room.deposit)}</dd>
              </div>
            </dl>
            {room.amenities.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {room.amenities.map((a) => (
                  <li key={a}>
                    <Badge>{a}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <PrivateRoomDialog
          key={editing === "new" ? "new" : editing.id}
          branchId={branchId}
          room={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "room"}?`}
        description="The room is removed from the booking options."
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  );
}

export function PrivateDiningPage() {
  return <BranchRequired>{(branchId) => <RoomList branchId={branchId} />}</BranchRequired>;
}
