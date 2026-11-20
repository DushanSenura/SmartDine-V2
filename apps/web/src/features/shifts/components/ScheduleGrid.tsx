import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, ListSkeleton } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { useStaff } from "@/features/staff/api/staffQueries";
import { Users } from "lucide-react";

import { useSchedule, useSetScheduleEntry, useShifts } from "../api/shiftQueries";

const iso = (date: Date) => format(date, "yyyy-MM-dd");

export function ScheduleGrid({ branchId }: { branchId: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const from = iso(days[0]!);
  const to = iso(days[6]!);

  const staff = useStaff(branchId);
  const shifts = useShifts();
  const schedule = useSchedule(branchId, from, to);
  const setEntry = useSetScheduleEntry();
  const [error, setError] = useState<string | null>(null);

  const entryFor = (userId: string, date: string) =>
    schedule.data?.find((e) => e.userId === userId && e.date === date);

  const onChange = async (userId: string, date: string, value: string) => {
    setError(null);
    const existing = entryFor(userId, date);
    try {
      await setEntry.mutateAsync({
        existingId: existing?.id,
        clear: value === "",
        entry: {
          userId,
          branchId,
          date,
          dayOff: value === "off",
          shiftId: value === "off" || value === "" ? null : value,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the schedule.");
    }
  };

  if (staff.isPending || shifts.isPending) return <ListSkeleton />;
  if (!staff.data?.length) {
    return (
      <EmptyState
        icon={Users}
        title="No staff to schedule"
        text="Add staff to this branch first."
      />
    );
  }
  if (!shifts.data?.length) {
    return (
      <EmptyState
        icon={Users}
        title="No shift types yet"
        text="Create shift types (Morning, Evening…) in the Shift types tab."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous week"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <p className="min-w-48 text-center text-sm font-medium">
          {format(days[0]!, "d MMM")} – {format(days[6]!, "d MMM yyyy")}
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next week"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        >
          This week
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Staff</th>
              {days.map((day) => (
                <th key={day.toISOString()} className="px-2 py-3 font-medium">
                  {format(day, "EEE d")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.data.map((member) => (
              <tr key={member.id} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {member.firstName} {member.lastName}
                  <span className="block text-xs font-normal text-muted-foreground capitalize">
                    {member.role.toLowerCase()}
                  </span>
                </th>
                {days.map((day) => {
                  const date = iso(day);
                  const entry = entryFor(member.id, date);
                  const value = entry ? (entry.dayOff ? "off" : (entry.shiftId ?? "")) : "";
                  return (
                    <td key={date} className="px-1 py-2">
                      <select
                        aria-label={`${member.firstName} ${format(day, "EEEE d MMMM")}`}
                        value={value}
                        onChange={(e) => void onChange(member.id, date, e.target.value)}
                        className="h-9 w-full rounded-md border border-border bg-surface px-1.5 text-xs"
                      >
                        <option value="">—</option>
                        <option value="off">Day off</option>
                        {shifts.data.map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
