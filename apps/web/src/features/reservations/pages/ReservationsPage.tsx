import { useSearchParams } from "react-router-dom";

import { BranchPicker } from "@/features/public/components/BranchPicker";
import { PageIntro } from "@/features/public/components/PageIntro";
import { cn } from "@/lib/utils";

import { PrivateDiningFlow } from "../components/PrivateDiningFlow";
import { TableReservationFlow } from "../components/TableReservationFlow";

const TABS = [
  { id: "table", label: "Restaurant table" },
  { id: "private", label: "Private dining" },
] as const;

export function ReservationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "private" ? "private" : "table";

  return (
    <>
      <PageIntro
        eyebrow="Reservations"
        title={tab === "private" ? "Host your event" : "Reserve a table"}
        text={
          tab === "private"
            ? "Celebrations, meetings and family dinners in a room of your own."
            : "Choose a day and time, and we'll find you a table. Free to book."
        }
      >
        <BranchPicker className="mt-2 md:hidden" />
      </PageIntro>
      <div className="mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
        <div
          role="tablist"
          aria-label="Reservation type"
          className="flex gap-1 border-b border-border"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setParams(id === "table" ? {} : { tab: id }, { replace: true })}
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
        <div role="tabpanel">
          {tab === "private" ? <PrivateDiningFlow /> : <TableReservationFlow />}
        </div>
      </div>
    </>
  );
}
