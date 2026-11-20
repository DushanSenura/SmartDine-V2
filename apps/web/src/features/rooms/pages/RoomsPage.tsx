import { BedDouble, SearchX } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState } from "@/components/feedback/EmptyState";
import { PageIntro } from "@/features/public/components/PageIntro";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { ApiClientError } from "@/services/api/client";
import { formatMoney } from "@/utils/format";

import { useRoomAvailability } from "../api/roomQueries";
import { Amenities, RoomFacts, RoomVisual } from "../components/RoomParts";
import { StaySearchForm } from "../components/StaySearchForm";
import { useStaySearch } from "../hooks/useStaySearch";

export function RoomsPage() {
  const { branch } = usePublicBranch();
  const { search, setSearch, queryString, today } = useStaySearch();
  const { data, isPending, isError, error, refetch } = useRoomAvailability(branch?.id, search);
  const nights = data?.nights ?? 0;

  return (
    <>
      <PageIntro
        eyebrow="Accommodation"
        title="Stay with us"
        text="Choose your dates and we'll show the rooms available. Rooms are held for you as soon as you book."
      />
      <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
        {/* Remounted when the committed search changes (for example from the URL) so its draft resets. */}
        <StaySearchForm key={queryString} value={search} today={today} onSubmit={setSearch} />

        {isPending && (
          <ul role="status" aria-label="Searching rooms" className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <li
                key={i}
                className="h-72 animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none"
              />
            ))}
          </ul>
        )}
        {isError && (
          <ErrorState
            message={
              error instanceof ApiClientError && error.status === 400
                ? error.message
                : "We couldn't check availability."
            }
            onRetry={() => void refetch()}
          />
        )}
        {data && data.results.length === 0 && (
          <EmptyState
            icon={SearchX}
            title="No available rooms found"
            text="Try different dates, or fewer guests. Large parties may need more than one room."
          />
        )}

        {data && data.results.length > 0 && (
          <section aria-label="Available rooms" className="space-y-4">
            <p className="text-sm text-muted-foreground" role="status">
              {data.results.length} room {data.results.length === 1 ? "type" : "types"} available ·
              check-in from {data.checkInTime}, check-out by {data.checkOutTime}
            </p>
            <ul className="grid gap-5 md:grid-cols-2">
              {data.results.map(({ roomType, available, quote }) => (
                <li
                  key={roomType.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
                >
                  <RoomVisual type={roomType} className="aspect-[16/9] w-full" />
                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-display text-xl font-semibold">{roomType.name}</h2>
                      {available <= 3 && (
                        <span className="shrink-0 rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-medium">
                          {available === 1 ? "Last room" : `${available} left`}
                        </span>
                      )}
                    </div>
                    <RoomFacts type={roomType} />
                    <Amenities items={roomType.amenities} limit={6} />
                    <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
                      <div>
                        <p className="text-lg font-semibold">
                          {formatMoney(Math.round(quote.roomSubtotal / nights), quote.currency)}
                          <span className="text-sm font-normal text-muted-foreground">
                            {" "}
                            / night
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(quote.total, quote.currency)} total for {nights}{" "}
                          {nights === 1 ? "night" : "nights"}
                          {quote.taxes > 0 && " incl. taxes"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          to={`/rooms/${roomType.slug}?${queryString}`}
                          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-muted"
                        >
                          Details
                        </Link>
                        <Link
                          to={`/rooms/${roomType.slug}/book?${queryString}`}
                          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Book
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!branch && !isPending && (
          <EmptyState icon={BedDouble} title="Rooms aren't available online yet" />
        )}
      </div>
    </>
  );
}
