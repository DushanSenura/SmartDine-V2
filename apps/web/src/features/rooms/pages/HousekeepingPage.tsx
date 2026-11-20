import {
  HOUSEKEEPING_LABELS,
  HOUSEKEEPING_STATUSES,
  Permissions,
  type HousekeepingStatus,
  type RoomDto,
} from "@smartdine/shared";
import { CheckCheck, SprayCan } from "lucide-react";
import { useState } from "react";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useStaff } from "@/features/staff/api/staffQueries";
import { cn } from "@/lib/utils";

import {
  useHousekeepingTasks,
  useLiveRooms,
  useRooms,
  useSetHousekeeping,
  useUpdateTask,
} from "../api/roomQueries";

const TONES: Record<HousekeepingStatus, "success" | "danger" | "warning" | "info" | "neutral"> = {
  CLEAN: "success",
  DIRTY: "danger",
  CLEANING: "warning",
  INSPECTION: "info",
  MAINTENANCE: "neutral",
};

function RoomRow({ room, onError }: { room: RoomDto; onError: (m: string | null) => void }) {
  const set = useSetHousekeeping();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <span className="font-display text-xl font-semibold">{room.roomNumber}</span>
        <div className="text-sm">
          <p className="text-muted-foreground">{room.roomTypeName}</p>
          {room.status === "OCCUPIED" && <p className="text-info">Occupied</p>}
        </div>
        <Badge tone={TONES[room.housekeepingStatus]}>
          {HOUSEKEEPING_LABELS[room.housekeepingStatus]}
        </Badge>
      </div>
      <div
        role="group"
        aria-label={`Housekeeping status of room ${room.roomNumber}`}
        className="flex flex-wrap gap-1"
      >
        {HOUSEKEEPING_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={room.housekeepingStatus === s}
            disabled={set.isPending}
            onClick={async () => {
              onError(null);
              try {
                await set.mutateAsync({ roomId: room.id, housekeepingStatus: s });
              } catch (e) {
                onError(e instanceof Error ? e.message : "Couldn't update the room.");
              }
            }}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              room.housekeepingStatus === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-surface-muted",
            )}
          >
            {HOUSEKEEPING_LABELS[s]}
          </button>
        ))}
      </div>
    </li>
  );
}

function Board({ branchId }: { branchId: string }) {
  const { can } = useAuth();
  const rooms = useRooms(branchId);
  const tasks = useHousekeepingTasks(branchId);
  const updateTask = useUpdateTask();
  // Only managers can list staff for assignments.
  const staff = useStaff(branchId, undefined, can(Permissions.STAFF_MANAGE));
  const [filter, setFilter] = useState<HousekeepingStatus | "ALL">("ALL");
  const [error, setError] = useState<string | null>(null);
  useLiveRooms(branchId);

  const visible = (rooms.data ?? []).filter(
    (r) => filter === "ALL" || r.housekeepingStatus === filter,
  );

  return (
    <>
      <PageHeader
        title="Housekeeping"
        description="Keep rooms clean and ready. A checked-out room stays out of service until it is marked clean."
      />
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      <section aria-labelledby="tasks-title" className="mb-10 space-y-3">
        <h2 id="tasks-title" className="font-display text-xl font-semibold">
          Open tasks
        </h2>
        {tasks.isPending && <ListSkeleton rows={2} />}
        {tasks.data?.length === 0 && (
          <EmptyState
            icon={CheckCheck}
            title="All caught up"
            text="Rooms to clean after check-out will appear here."
          />
        )}
        <ul className="space-y-2">
          {tasks.data?.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div>
                <p className="font-medium">
                  Room {t.roomNumber} ·{" "}
                  {t.type === "CHECKOUT_CLEAN" ? "Check-out clean" : t.type.toLowerCase()}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.assignedToName ? `Assigned to ${t.assignedToName}` : "Unassigned"}
                  {t.status === "IN_PROGRESS" ? " · in progress" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {staff.data && (
                  <select
                    aria-label={`Assign room ${t.roomNumber}`}
                    value={t.assignedToId ?? ""}
                    onChange={(e) =>
                      void updateTask.mutateAsync({
                        id: t.id,
                        assignedToId: e.target.value || null,
                      })
                    }
                    className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {staff.data.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </option>
                    ))}
                  </select>
                )}
                {t.status === "OPEN" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void updateTask.mutateAsync({ id: t.id, status: "IN_PROGRESS" })}
                  >
                    Start
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={updateTask.isPending}
                  onClick={async () => {
                    setError(null);
                    try {
                      await updateTask.mutateAsync({ id: t.id, status: "DONE" });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Couldn't complete the task.");
                    }
                  }}
                >
                  Mark clean
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rooms-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rooms-title" className="font-display text-xl font-semibold">
            All rooms
          </h2>
          <div role="group" aria-label="Filter rooms" className="flex flex-wrap gap-1">
            {(["ALL", ...HOUSEKEEPING_STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  filter === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-surface-muted",
                )}
              >
                {s === "ALL" ? "All" : HOUSEKEEPING_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        {rooms.isPending && <ListSkeleton />}
        {rooms.isError && (
          <ErrorState message="Couldn't load rooms." onRetry={() => void rooms.refetch()} />
        )}
        {rooms.data && visible.length === 0 && (
          <EmptyState icon={SprayCan} title="No rooms match" />
        )}
        <ul className="space-y-2">
          {visible.map((r) => (
            <RoomRow key={r.id} room={r} onError={setError} />
          ))}
        </ul>
      </section>
    </>
  );
}

export function HousekeepingPage() {
  return <BranchRequired>{(branchId) => <Board branchId={branchId} />}</BranchRequired>;
}
