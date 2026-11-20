import { MessageSquareText } from "lucide-react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { formatDate } from "@/utils/format";

import { usePublicReviews } from "../api/reviewQueries";
import { Stars } from "./StarRating";

/** The average rating and latest published reviews for the visitor's branch. */
export function GuestReviews() {
  const { branch } = usePublicBranch();
  const { data } = usePublicReviews(branch?.id);
  if (!data) return null;

  return (
    <section aria-label="Guest reviews" className="mx-auto mt-12 max-w-6xl space-y-4 px-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold">What guests say</h2>
        {data.average !== null && (
          <p className="flex items-center gap-2 text-sm">
            <Stars rating={data.average} />
            <span className="font-medium">{data.average.toFixed(1)}</span>
            <span className="text-muted-foreground">
              from {data.count} {data.count === 1 ? "review" : "reviews"}
            </span>
          </p>
        )}
      </div>
      {data.reviews.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No reviews yet"
          text="Reviews from guests who've dined or stayed with us will appear here."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.reviews.map((r) => (
            <li key={r.id} className="space-y-2 rounded-xl border border-border bg-surface p-5">
              <Stars rating={r.rating} />
              {r.comment && <p className="text-sm">“{r.comment}”</p>}
              <p className="text-xs text-muted-foreground">
                {r.authorName} · {formatDate(r.createdAt.slice(0, 10))}
              </p>
              {r.response && (
                <p className="rounded-md bg-surface-muted p-2.5 text-xs">
                  <span className="font-medium">Reply from the team:</span> {r.response}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
