import { useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { cn } from "@/lib/utils";

import { AttendanceRoster } from "../components/AttendanceRoster";
import { ScheduleGrid } from "../components/ScheduleGrid";
import { ShiftTypes } from "../components/ShiftTypes";

const TABS = [
  { id: "schedule", label: "Weekly schedule" },
  { id: "types", label: "Shift types" },
  { id: "attendance", label: "Attendance" },
] as const;

export function ShiftsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("schedule");

  return (
    <div>
      <PageHeader title="Shifts" description="Plan who works when, and see who is on shift." />
      <div
        role="tablist"
        aria-label="Shift sections"
        className="mb-5 flex gap-1 border-b border-border"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "types" ? (
          <ShiftTypes />
        ) : (
          <BranchRequired>
            {(branchId) =>
              tab === "schedule" ? (
                <ScheduleGrid branchId={branchId} />
              ) : (
                <AttendanceRoster branchId={branchId} />
              )
            }
          </BranchRequired>
        )}
      </div>
    </div>
  );
}
