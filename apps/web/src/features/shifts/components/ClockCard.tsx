import { format } from "date-fns";
import { Clock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";

import { useClock, useMyAttendance } from "../api/shiftQueries";

/** Clock in / out for staff accounts that belong to a branch. */
export function ClockCard() {
  const { user } = useAuth();
  const current = useMyAttendance();
  const clock = useClock();
  const [error, setError] = useState<string | null>(null);

  if (!user?.branchId) return null;
  const open = current.data;

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-surface-muted">
          <Clock className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Attendance</h2>
          <p className="text-sm text-muted-foreground" role="status">
            {open
              ? `On shift since ${format(new Date(open.clockInAt), "HH:mm")}`
              : "You are clocked out"}
          </p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
      <Button
        variant={open ? "outline" : "primary"}
        disabled={current.isPending || clock.isPending}
        onClick={async () => {
          setError(null);
          try {
            await clock.mutateAsync(open ? "out" : "in");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        }}
      >
        {open ? "Clock out" : "Clock in"}
      </Button>
    </section>
  );
}
