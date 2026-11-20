import type { SearchKind, SearchResultDto } from "@smartdine/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BedDouble,
  CalendarDays,
  ClipboardList,
  Contact,
  DoorOpen,
  LayoutGrid,
  Search,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Dialog } from "@/components/ui/Dialog";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/services/api/client";

const KINDS: Record<SearchKind, { label: string; icon: typeof Search }> = {
  order: { label: "Orders", icon: ClipboardList },
  reservation: { label: "Reservations", icon: CalendarDays },
  "room-booking": { label: "Room bookings", icon: BedDouble },
  customer: { label: "Customers", icon: Contact },
  "menu-item": { label: "Menu items", icon: UtensilsCrossed },
  table: { label: "Tables", icon: LayoutGrid },
  staff: { label: "Staff", icon: UserRound },
  room: { label: "Rooms", icon: DoorOpen },
};

function useDebounced(value: string, ms = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Ctrl/Cmd+K anywhere in the staff app opens a single search across everything the role may open. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { branchId } = useCurrentBranch();
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const q = useDebounced(term.trim());

  const { data, isFetching, isError } = useQuery({
    queryKey: ["search", q, branchId],
    queryFn: ({ signal }) =>
      apiRequest<SearchResultDto[]>(
        `/search?q=${encodeURIComponent(q)}${branchId ? `&branchId=${branchId}` : ""}`,
        { signal },
      ),
    enabled: open && q.length >= 2,
    staleTime: 10_000,
  });
  // Results belong to the text they were searched for. While the debounce catches up with what was
  // just typed, show nothing rather than the previous query's matches.
  const settled = q === term.trim();
  const results = settled && q.length >= 2 ? (data ?? []) : [];

  const go = (result: SearchResultDto) => {
    onClose();
    setTerm("");
    navigate(result.link);
  };

  // Keep the highlighted row valid as results change.
  const rowCount = results.length;
  const current = rowCount === 0 ? 0 : Math.min(active, rowCount - 1);

  const grouped = (Object.keys(KINDS) as SearchKind[])
    .map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);
  const flat = grouped.flatMap((g) => g.items);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setTerm("");
        }
      }}
      title="Search"
      description="Find orders, reservations, bookings, customers, dishes, tables, staff and rooms."
    >
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Search everything</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={input}
            autoFocus
            type="search"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-activedescendant={flat[current] ? `${listId}-${current}` : undefined}
            value={term}
            placeholder="Search by name, number, reference…"
            onChange={(e) => {
              setTerm(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(flat.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && flat[current]) {
                e.preventDefault();
                go(flat[current]);
              }
            }}
            className="h-11 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-sm"
          />
        </label>

        <div role="status" aria-live="polite" className="min-h-5 text-xs text-muted-foreground">
          {term.trim().length < 2
            ? "Type at least 2 characters."
            : !settled || isFetching
              ? "Searching…"
              : isError
                ? "Search isn't available right now."
                : flat.length === 0
                  ? `No results for “${q}”.`
                  : `${flat.length} ${flat.length === 1 ? "result" : "results"}`}
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="max-h-80 space-y-3 overflow-y-auto"
        >
          {grouped.map(({ kind, items }) => {
            const { label, icon: Icon } = KINDS[kind];
            return (
              <div key={kind} role="group" aria-label={label}>
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Icon className="size-3.5" aria-hidden /> {label}
                </h3>
                <ul>
                  {items.map((r) => {
                    const index = flat.indexOf(r);
                    return (
                      <li
                        key={`${r.kind}-${r.id}`}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === current}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(r)}
                        className={cn(
                          "cursor-pointer rounded-md px-3 py-2",
                          index === current ? "bg-primary/10" : "hover:bg-surface-muted",
                        )}
                      >
                        <p className="text-sm font-medium">{r.title}</p>
                        {r.subtitle && (
                          <p className="text-xs text-muted-foreground">{r.subtitle}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
