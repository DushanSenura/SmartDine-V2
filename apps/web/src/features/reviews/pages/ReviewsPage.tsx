import { REVIEW_STATUSES, type ReviewDto, type ReviewStatus } from "@smartdine/shared";
import { MessageSquareText } from "lucide-react";
import { useState } from "react";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { formatDateTime, titleCase } from "@/utils/format";

import { useModerateReview, useReviews } from "../api/reviewQueries";
import { Stars } from "../components/StarRating";

function ReviewCard({ review }: { review: ReviewDto }) {
  const moderate = useModerateReview();
  const [replying, setReplying] = useState(false);
  const [response, setResponse] = useState(review.response ?? "");
  const [error, setError] = useState<string | null>(null);
  const hidden = review.status === "HIDDEN";

  const run = async (input: { status?: ReviewStatus; response?: string }) => {
    setError(null);
    try {
      await moderate.mutateAsync({ id: review.id, input });
      setReplying(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <li className="space-y-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {review.authorName} <Stars rating={review.rating} />
        </p>
        <span className="flex items-center gap-2">
          <Badge tone="neutral">{titleCase(review.kind)}</Badge>
          <Badge tone={hidden ? "danger" : "success"}>{hidden ? "Hidden" : "Published"}</Badge>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {review.branchName} · {formatDateTime(review.createdAt, "UTC")}
      </p>
      {review.comment ? (
        <p className="text-sm">“{review.comment}”</p>
      ) : (
        <p className="text-sm text-muted-foreground">No comment.</p>
      )}
      {review.response && !replying && (
        <p className="rounded-md bg-surface-muted p-2.5 text-sm">
          <span className="font-medium">Our reply:</span> {review.response}
        </p>
      )}
      {replying && (
        <div className="space-y-2">
          <TextField
            label="Reply"
            value={response}
            maxLength={1000}
            onChange={(e) => setResponse(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={moderate.isPending || !response.trim()}
              onClick={() => void run({ response: response.trim() })}
            >
              Post reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <FormError message={error} />
      {!replying && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setReplying(true)}>
            {review.response ? "Edit reply" : "Reply"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={moderate.isPending}
            onClick={() => void run({ status: hidden ? "PUBLISHED" : "HIDDEN" })}
          >
            {hidden ? "Publish" : "Hide"}
          </Button>
        </div>
      )}
    </li>
  );
}

function Reviews({ branchId }: { branchId: string }) {
  const [status, setStatus] = useState<ReviewStatus | "">("");
  const { data, isPending, isError, refetch } = useReviews(branchId, status || undefined);
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What guests say. Hide a review to take it off the website; reply to thank or put things right."
      />
      <div className="mb-4 max-w-xs">
        <SelectField
          label="Show"
          value={status}
          placeholder="All reviews"
          onChange={(e) => setStatus(e.target.value as ReviewStatus | "")}
          options={REVIEW_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
        />
      </div>
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load reviews." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={MessageSquareText}
          title="No reviews yet"
          text="Guests can review a visit once it's paid, or a stay once they've checked out."
        />
      )}
      <ul className="space-y-3">
        {data?.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </ul>
    </>
  );
}

export function ReviewsPage() {
  return <BranchRequired>{(branchId) => <Reviews branchId={branchId} />}</BranchRequired>;
}
