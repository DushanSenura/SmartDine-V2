import { PROMOTION_TYPE_LABELS, WEEK_DAYS } from "@smartdine/shared";
import { Clock, ImageOff, Mail, MapPin, Phone, Tag } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { usePublicOffers } from "@/features/promotions/api/promotionQueries";
import { GuestReviews } from "@/features/reviews/components/GuestReviews";
import { formatMoney } from "@/utils/format";

import { useGallery } from "../api/publicQueries";
import { BranchPicker } from "../components/BranchPicker";
import { PageIntro } from "../components/PageIntro";
import { usePublicBranch } from "../hooks/usePublicBranch";
import { offerHeadline, offerWhen } from "../utils/offers";

const linkButton =
  "inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90";

export function OffersPage() {
  const { branch, currency } = usePublicBranch();
  const { data, isPending, isError, refetch } = usePublicOffers(branch?.id);
  return (
    <>
      <PageIntro
        eyebrow="Offers"
        title="Seasonal offers"
        text="What's on right now. Mention an offer to your server, or show your code at the till."
      />
      <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
        <BranchPicker />
        {isPending && <ListSkeleton rows={3} />}
        {isError && (
          <ErrorState message="Couldn't load the offers." onRetry={() => void refetch()} />
        )}
        {data?.length === 0 && (
          <EmptyState
            icon={Tag}
            title="No offers right now"
            text="There are no active promotions at the moment. Check back soon, or see what's on the menu."
            action={
              <Link to="/menu" className={linkButton}>
                View the menu
              </Link>
            }
          />
        )}
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((o) => (
            <li
              key={o.id}
              className="space-y-2 rounded-xl border border-border bg-surface p-5 shadow-sm"
            >
              <p className="text-xs font-medium tracking-wide text-primary uppercase">
                {PROMOTION_TYPE_LABELS[o.type]}
              </p>
              <h2 className="font-display text-xl font-semibold">{o.name}</h2>
              {offerHeadline(o, currency) && (
                <p className="text-lg font-semibold">{offerHeadline(o, currency)}</p>
              )}
              {o.description && <p className="text-sm text-muted-foreground">{o.description}</p>}
              {offerWhen(o) && <p className="text-xs text-muted-foreground">{offerWhen(o)}</p>}
              {o.minimumSpend > 0 && (
                <p className="text-xs text-muted-foreground">
                  Minimum spend {formatMoney(o.minimumSpend, currency)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About"
        title="Food, people and a good table"
        text="SmartDine is a neighbourhood restaurant built around simple ideas."
      />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-3">
        {[
          [
            "Cooked from scratch",
            "Our kitchen prepares sauces, breads and desserts in-house, and the specials change with what's good that day.",
          ],
          [
            "Clear about what's in it",
            "Every dish lists allergens and dietary information, so you can order with confidence.",
          ],
          [
            "Room for every occasion",
            "Dinner for two, a long family lunch or a private celebration — we'll find the right table or room.",
          ],
        ].map(([title, text]) => (
          <section key={title} className="space-y-2 rounded-xl border border-border bg-surface p-6">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{text}</p>
          </section>
        ))}
      </div>
      <GuestReviews />
    </>
  );
}

export function GalleryPage() {
  const { branch } = usePublicBranch();
  const { data, isPending } = useGallery(branch?.id);
  return (
    <>
      <PageIntro
        eyebrow="Gallery"
        title="A look inside"
        text="Dishes and rooms, as photographed by our team."
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {isPending ? (
          <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="aspect-[4/3] animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={ImageOff}
            title="Photos coming soon"
            text="We're still adding photos of our dishes and rooms."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {data.map((image) => (
              <li key={image.src} className="overflow-hidden rounded-xl">
                <img
                  src={image.src}
                  alt={image.caption}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-105"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const DAY_LABELS = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
} as const;

export function ContactPage() {
  const { branch } = usePublicBranch();
  const hours = branch?.openingHours;
  const map =
    branch?.latitude != null && branch.longitude != null
      ? `https://www.openstreetmap.org/?mlat=${branch.latitude}&mlon=${branch.longitude}#map=17/${branch.latitude}/${branch.longitude}`
      : null;

  return (
    <>
      <PageIntro
        eyebrow="Contact"
        title="Visit or get in touch"
        text="Call us, email, or just turn up."
      >
        <BranchPicker className="mt-2" />
      </PageIntro>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-2">
        {branch ? (
          <>
            <section className="space-y-4 rounded-xl border border-border bg-surface p-6">
              <h2 className="font-display text-2xl font-semibold">{branch.name}</h2>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    {[branch.address, branch.city].filter(Boolean).join(", ") ||
                      "Address coming soon"}
                  </span>
                </li>
                {branch.phone && (
                  <li className="flex items-center gap-3">
                    <Phone className="size-4 text-primary" aria-hidden />
                    <a
                      href={`tel:${branch.phone.replaceAll(" ", "")}`}
                      className="hover:text-primary"
                    >
                      {branch.phone}
                    </a>
                  </li>
                )}
                {branch.email && (
                  <li className="flex items-center gap-3">
                    <Mail className="size-4 text-primary" aria-hidden />
                    <a href={`mailto:${branch.email}`} className="hover:text-primary">
                      {branch.email}
                    </a>
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link to="/reservations" className={linkButton}>
                  Reserve a table
                </Link>
                {map && (
                  <a
                    href={map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-muted"
                  >
                    View on map
                  </a>
                )}
              </div>
            </section>
            <section className="space-y-3 rounded-xl border border-border bg-surface p-6">
              <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
                <Clock className="size-5 text-primary" aria-hidden /> Opening hours
              </h2>
              {hours ? (
                <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
                  {WEEK_DAYS.map((day) => (
                    <div key={day} className="contents">
                      <dt className="text-muted-foreground">{DAY_LABELS[day]}</dt>
                      <dd>
                        {hours[day] ? `${hours[day]!.open} – ${hours[day]!.close}` : "Closed"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Please call us for opening hours.</p>
              )}
            </section>
          </>
        ) : (
          <EmptyState icon={MapPin} title="Location details coming soon" />
        )}
      </div>
    </>
  );
}
