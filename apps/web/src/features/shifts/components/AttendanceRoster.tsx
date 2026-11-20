import { format } from "date-fns";
import { UserCheck } from "lucide-react";
import { useState } from "react";

import { EmptyState, ListSkeleton } from "@/components/feedback/EmptyState";
import { TextField } from "@/components/forms/TextField";

import { useAttendanceRoster } from "../api/shiftQueries";

const time = (iso: string) => format(new Date(iso), "HH:mm");

export function AttendanceRoster({ branchId }: { branchId: string }) {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const { data, isPending } = useAttendanceRoster(branchId, date);

  return (
    <div className="space-y-4">
      <div className="max-w-48">
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </div>
      {isPending ? (
        <ListSkeleton rows={3} />
      ) : !data?.length ? (
        <EmptyState
          icon={UserCheck}
          title="No clock-ins for this date"
          text="Staff clock in from their dashboard."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Clock in</th>
                <th className="px-4 py-3 font-medium">Clock out</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{row.userName}</td>
                  <td className="px-4 py-3">{time(row.clockInAt)}</td>
                  <td className="px-4 py-3">
                    {row.clockOutAt ? time(row.clockOutAt) : "On shift"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
