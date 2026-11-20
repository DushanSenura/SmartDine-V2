import {
  OCCASION_LABELS,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUSES,
  RESERVATION_TRANSITIONS,
  SocketEvents,
  type ReservationDto,
  type ReservationStatus,
} from "@smartdine/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { getSocket } from "@/services/socket/socket";
import { useBranchRoom } from "@/services/socket/useBranchRoom";
import { addDays, formatDate, formatDateTime, formatTime, todayInZone } from "@/utils/format";

import { useSetReservationStatus, useStaffReservations } from "../api/reservationQueries";
import { StaffBookingDialog } from "../components/StaffBookingDialog";
import { ReservationStatusBadge } from "../components/StatusBadge";

const ACTION_LABELS: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: "Confirm",
  CHECKED_IN: "Check in",
  SEATED: "Seat",
  COMPLETED: "Complete",
  NO_SHOW: "No-show",
  CANCELLED: "Cancel",
};

function useLiveReservations(branchId: string) {
  const queryClient = useQueryClient();
  useBranchRoom(branchId);
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    };
    socket.on(SocketEvents.RESERVATION_CHANGED, refresh);
    return () => {
      socket.off(SocketEvents.RESERVATION_CHANGED, refresh);
    };
  }, [queryClient]);
}

function Day({ branchId }: { branchId: string }) {
  const { branch } = useCurrentBranch();
  const timezone = branch?.timezone ?? "UTC";
  const today = todayInZone(timezone);
  const [date, setDate] = useState(today);
  const [upcoming, setUpcoming] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [booking, setBooking] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<ReservationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useStaffReservations(
    branchId,
    upcoming ? null : date,
  );
  const setStatus = useSetReservationStatus();
  useLiveReservations(branchId);

  const list = (data ?? []).filter((r) => !statusFilter || r.status === statusFilter);

  const act = async (r: ReservationDto, status: ReservationStatus) => {
    setError(null);
    try {
      await setStatus.mutateAsync({ id: r.id, status });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the reservation.");
    }
  };

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Bookings for the day. New online bookings appear here instantly."
        actions={
          <Button onClick={() => setBooking(true)}>
            <Plus className="size-4" aria-hidden /> New reservation
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="View">
          <Button
            variant={upcoming ? "primary" : "outline"}
            aria-pressed={upcoming}
            onClick={() => setUpcoming(true)}
          >
            All upcoming
          </Button>
          <Button
            variant={upcoming ? "outline" : "primary"}
            aria-pressed={!upcoming}
            onClick={() => setUpcoming(false)}
          >
            By day
          </Button>
        </div>
        <div className={upcoming ? "hidden" : "flex items-center gap-1"}>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous day"
            onClick={() => setDate(addDays(date, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <input
            type="date"
            aria-label="Date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Next day"
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {date !== today && (
            <Button variant="ghost" onClick={() => setDate(today)}>
              Today
            </Button>
          )}
        </div>
        <div className="w-44">
          <SelectField
            label="Status"
            placeholder="All statuses"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={RESERVATION_STATUSES.map((s) => ({
              value: s,
              label: RESERVATION_STATUS_LABELS[s],
            }))}
          />
        </div>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {upcoming ? "All upcoming reservations at this branch" : formatDate(date)}
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      {isPending && <ListSkeleton />}
      {isError && (
        <ErrorState message="Couldn't load reservations." onRetry={() => void refetch()} />
      )}
      {data && list.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title={
            data.length
              ? "No reservations match this filter"
              : upcoming
                ? "No upcoming reservations"
                : "No reservations for this date"
          }
          action={<Button onClick={() => setBooking(true)}>Add a reservation</Button>}
        />
      )}

      <ul className="space-y-2">
        {list.map((r) => {
          const next = RESERVATION_TRANSITIONS[r.status];
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {upcoming
                    ? formatDateTime(r.startsAt, r.timezone)
                    : formatTime(r.startsAt, r.timezone)}{" "}
                  · {r.guestName}
                  <ReservationStatusBadge status={r.status} />
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.partySize} guests ·{" "}
                  {r.type === "PRIVATE_DINING"
                    ? `${r.roomName} (${r.occasion ? OCCASION_LABELS[r.occasion] : "event"})`
                    : `Table ${r.tableNumber ?? "—"}${r.areaName ? ` · ${r.areaName}` : ""}`}{" "}
                  · {r.guestPhone} · <span className="font-mono">{r.reference}</span>
                </p>
                {r.specialRequest && <p className="text-sm">“{r.specialRequest}”</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {next.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={status === "CANCELLED" || status === "NO_SHOW" ? "outline" : "primary"}
                    disabled={setStatus.isPending}
                    onClick={() =>
                      status === "CANCELLED" ? setPendingCancel(r) : void act(r, status)
                    }
                  >
                    {ACTION_LABELS[status]}
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {booking && (
        <StaffBookingDialog
          branchId={branchId}
          defaultDate={date}
          onClose={() => setBooking(false)}
        />
      )}
      <ConfirmDialog
        open={!!pendingCancel}
        onOpenChange={(open) => !open && setPendingCancel(null)}
        title="Cancel this reservation?"
        description={
          pendingCancel
            ? `${pendingCancel.guestName}, ${pendingCancel.partySize} guests. The table or room is released.`
            : ""
        }
        confirmLabel="Cancel reservation"
        onConfirm={() => setStatus.mutateAsync({ id: pendingCancel!.id, status: "CANCELLED" })}
      />
    </>
  );
}

export function StaffReservationsPage() {
  return <BranchRequired>{(branchId) => <Day branchId={branchId} />}</BranchRequired>;
}
