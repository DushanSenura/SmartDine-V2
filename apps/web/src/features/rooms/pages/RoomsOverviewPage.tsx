import { BedDouble, DoorOpen, LogIn, LogOut, Plus, SprayCan } from "lucide-react";
import { useState } from "react";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { BranchRequired } from "@/features/branches/components/BranchRequired";

import { useLiveRooms, useRoomsOverview, useStaffRoomBookings } from "../api/roomQueries";
import { StaffBookingRow } from "../components/StaffBookingRow";
import { StaffRoomBookingDialog } from "../components/StaffRoomBookingDialog";

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden /> {label}
      </p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Overview({ branchId }: { branchId: string }) {
  const overview = useRoomsOverview(branchId);
  const bookings = useStaffRoomBookings(branchId);
  const [booking, setBooking] = useState(false);
  useLiveRooms(branchId);

  const date = overview.data?.date;
  const arrivals = (bookings.data ?? []).filter(
    (b) => ["PENDING", "CONFIRMED"].includes(b.status) && b.checkIn === date,
  );
  const departures = (bookings.data ?? []).filter(
    (b) => b.status === "CHECKED_IN" && b.checkOut === date,
  );
  const inHouse = (bookings.data ?? []).filter(
    (b) => b.status === "CHECKED_IN" && b.checkOut !== date,
  );

  return (
    <>
      <PageHeader
        title="Rooms today"
        description="Arrivals, departures and occupancy. Updates live as the team works."
        actions={
          <Button onClick={() => setBooking(true)}>
            <Plus className="size-4" aria-hidden /> New booking
          </Button>
        }
      />

      {overview.isPending && <ListSkeleton rows={2} />}
      {overview.isError && (
        <ErrorState message="Couldn't load the overview." onRetry={() => void overview.refetch()} />
      )}
      {overview.data && overview.data.totalRooms === 0 && (
        <EmptyState
          icon={DoorOpen}
          title="No rooms yet"
          text="Create room types and rooms under Room types and Room inventory to start taking bookings."
        />
      )}
      {overview.data && overview.data.totalRooms > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat
            icon={BedDouble}
            label="Occupancy"
            value={`${overview.data.occupancyPercent}%`}
            hint={`${overview.data.occupied} of ${overview.data.totalRooms - overview.data.byStatus.MAINTENANCE - overview.data.byStatus.OUT_OF_SERVICE} sellable rooms`}
          />
          <Stat icon={DoorOpen} label="In house" value={overview.data.inHouse} />
          <Stat icon={LogIn} label="Arrivals today" value={overview.data.arrivalsToday} />
          <Stat icon={LogOut} label="Departures today" value={overview.data.departuresToday} />
          <Stat icon={SprayCan} label="Dirty rooms" value={overview.data.dirtyRooms} />
        </div>
      )}

      {bookings.isPending && <ListSkeleton />}
      {(
        [
          ["Arriving today", arrivals],
          ["Departing today", departures],
          ["In house", inHouse],
        ] as const
      ).map(([title, list]) => (
        <section key={title} aria-label={title} className="mb-8 space-y-3">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((b) => (
                <StaffBookingRow key={b.id} booking={b} />
              ))}
            </ul>
          )}
        </section>
      ))}

      {booking && date && (
        <StaffRoomBookingDialog
          branchId={branchId}
          today={date}
          onClose={() => setBooking(false)}
        />
      )}
    </>
  );
}

export function RoomsOverviewPage() {
  return <BranchRequired>{(branchId) => <Overview branchId={branchId} />}</BranchRequired>;
}
