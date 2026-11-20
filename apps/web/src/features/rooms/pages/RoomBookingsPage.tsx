import {
  ROOM_BOOKING_STATUSES,
  ROOM_BOOKING_STATUS_LABELS,
  type RoomBookingStatus,
} from "@smartdine/shared";
import { CalendarDays, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { todayInZone } from "@/utils/format";

import { useLiveRooms, useStaffRoomBookings } from "../api/roomQueries";
import { StaffBookingRow } from "../components/StaffBookingRow";
import { StaffRoomBookingDialog } from "../components/StaffRoomBookingDialog";

function Bookings({ branchId }: { branchId: string }) {
  const { branch } = useCurrentBranch();
  const [status, setStatus] = useState<RoomBookingStatus | "">("");
  const [creating, setCreating] = useState(false);
  const { data, isPending, isError, refetch } = useStaffRoomBookings(branchId, status || undefined);
  useLiveRooms(branchId);

  return (
    <>
      <PageHeader
        title="Room bookings"
        description="Current and upcoming stays."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> New booking
          </Button>
        }
      />
      <div className="mb-4 w-52">
        <SelectField
          label="Status"
          placeholder="All statuses"
          value={status}
          onChange={(e) => setStatus(e.target.value as RoomBookingStatus | "")}
          options={ROOM_BOOKING_STATUSES.map((s) => ({
            value: s,
            label: ROOM_BOOKING_STATUS_LABELS[s],
          }))}
        />
      </div>
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load bookings." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No bookings"
          text={
            status
              ? "Nothing matches this filter."
              : "New room bookings will appear here instantly."
          }
          action={<Button onClick={() => setCreating(true)}>Add a booking</Button>}
        />
      )}
      <ul className="space-y-2">
        {data?.map((b) => (
          <StaffBookingRow key={b.id} booking={b} />
        ))}
      </ul>
      {creating && (
        <StaffRoomBookingDialog
          branchId={branchId}
          today={todayInZone(branch?.timezone ?? "UTC")}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

export function RoomBookingsPage() {
  return <BranchRequired>{(branchId) => <Bookings branchId={branchId} />}</BranchRequired>;
}
