import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState, ErrorState } from "@/components/feedback/EmptyState";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/utils/format";

import { usePublicRoomType, useRoomAvailability } from "../api/roomQueries";
import { Amenities, PriceBreakdown, RoomFacts, RoomVisual } from "../components/RoomParts";
import { StaySearchForm } from "../components/StaySearchForm";
import { useStaySearch } from "../hooks/useStaySearch";
import { BedDouble } from "lucide-react";

export function RoomDetailsPage() {
  const { slug } = useParams();
  const { branch } = usePublicBranch();
  const { search, setSearch, queryString, today } = useStaySearch();
  const type = usePublicRoomType(branch?.id, slug);
  const availability = useRoomAvailability(branch?.id, search);
  const [photo, setPhoto] = useState(0);

  const offer = availability.data?.results.find((r) => r.roomType.slug === slug);

  if (type.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={BedDouble}
          title="Room not found"
          text="This room type isn't available at the selected location."
          action={
            <Link
              to={`/rooms?${queryString}`}
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Back to rooms
            </Link>
          }
        />
      </div>
    );
  }
  if (!type.data) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="mx-auto mt-10 h-96 max-w-6xl animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none"
      />
    );
  }
  const room = type.data;
  const gallery = room.images.length ? room.images : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <Link
        to={`/rooms?${queryString}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> All rooms
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="space-y-3">
            <RoomVisual
              type={{ ...room, images: gallery.slice(photo, photo + 1) }}
              className="aspect-[16/10] w-full rounded-xl"
            />
            {gallery.length > 1 && (
              <ul className="flex gap-2 overflow-x-auto" aria-label="Photos">
                {gallery.map((src, i) => (
                  <li key={src}>
                    <button
                      type="button"
                      aria-label={`Show photo ${i + 1}`}
                      aria-pressed={photo === i}
                      onClick={() => setPhoto(i)}
                      className={cn(
                        "overflow-hidden rounded-md border-2",
                        photo === i ? "border-primary" : "border-transparent",
                      )}
                    >
                      <img src={src} alt="" className="h-16 w-24 object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <h1 className="font-display text-4xl font-semibold">{room.name}</h1>
            <RoomFacts type={room} />
            {room.description && (
              <p className="max-w-prose text-muted-foreground">{room.description}</p>
            )}
          </div>
          {room.amenities.length > 0 && (
            <section aria-labelledby="amenities-title" className="space-y-3">
              <h2 id="amenities-title" className="font-display text-xl font-semibold">
                What's included
              </h2>
              <Amenities items={room.amenities} />
            </section>
          )}
          <p className="text-sm text-muted-foreground">
            From {formatMoney(room.basePrice, branch?.currency ?? "LKR")} per night
            {room.weekendPrice !== null &&
              room.weekendPrice !== room.basePrice &&
              ` (${formatMoney(room.weekendPrice, branch?.currency ?? "LKR")} on Friday and Saturday nights)`}
            .
          </p>
        </div>

        <aside
          aria-label="Your stay"
          className="h-fit space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-24"
        >
          <StaySearchForm key={queryString} value={search} today={today} onSubmit={setSearch} />
          <p className="text-sm text-muted-foreground">
            {formatDate(search.checkIn)} → {formatDate(search.checkOut)}
          </p>
          {availability.isPending && (
            <div
              role="status"
              aria-label="Checking availability"
              className="h-28 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none"
            />
          )}
          {availability.isError && (
            <ErrorState
              message="Couldn't check availability for those dates."
              onRetry={() => void availability.refetch()}
            />
          )}
          {availability.data && !offer && (
            <p role="status" className="rounded-md bg-warning/20 p-3 text-sm">
              {room.name} isn't available for these dates
              {search.adults + search.children > room.maximumGuests
                ? ` or for ${search.adults + search.children} guests`
                : ""}
              . Try different dates.
            </p>
          )}
          {offer && (
            <>
              <PriceBreakdown quote={offer.quote} />
              <Link
                to={`/rooms/${room.slug}/book?${queryString}`}
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Book this room
              </Link>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
