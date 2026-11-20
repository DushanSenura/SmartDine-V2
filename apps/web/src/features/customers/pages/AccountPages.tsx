import { LOYALTY_TRANSACTION_LABELS, type ReviewableDto } from "@smartdine/shared";
import { ChevronLeft, Download, Gift, Heart, MessageSquareText, Receipt, Star } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { TextAreaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { ReceiptView } from "@/features/cashier/components/ReceiptView";
import { downloadReceiptPdf } from "@/features/cashier/utils/receiptFile";
import { usePublicMenu } from "@/features/public/api/publicQueries";
import { BranchPicker } from "@/features/public/components/BranchPicker";
import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { StarInput, Stars } from "@/features/reviews/components/StarRating";
import { useCreateReview, useMyReviews, useReviewable } from "@/features/reviews/api/reviewQueries";
import { formatDate, formatDateTime, formatMoney } from "@/utils/format";

import {
  useFavourites,
  useMyInvoices,
  useMyLoyalty,
  useMyReceipt,
  useToggleFavourite,
} from "../api/customerQueries";

// ── Favourites ───────────────────────────────────────────────────

export function AccountFavouritesPage() {
  const { branch, currency } = usePublicBranch();
  const favourites = useFavourites();
  const menu = usePublicMenu(branch?.id, {});
  const toggle = useToggleFavourite();
  const saved = new Set(favourites.data ?? []);
  const items = (menu.data?.items ?? []).filter((i) => saved.has(i.id));

  if (favourites.isPending || menu.isPending) return <ListSkeleton rows={3} />;
  if (favourites.isError || menu.isError) {
    return (
      <ErrorState
        message="Couldn't load your favourites."
        onRetry={() => void favourites.refetch()}
      />
    );
  }
  return (
    <section aria-label="Favourites" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Dishes you've saved at this location.</p>
        <BranchPicker />
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No favourites here yet"
          text="Tap the heart on any dish on the menu to save it."
          action={
            <Link
              to="/menu"
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Browse the menu
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">{formatMoney(item.price, currency)}</p>
                {!item.isAvailableNow && (
                  <p className="text-xs text-muted-foreground">Not available right now</p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${item.name} from favourites`}
                onClick={() => toggle.mutate({ menuItemId: item.id, saved: true })}
              >
                <Heart aria-hidden className="size-4 fill-danger text-danger" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Loyalty ──────────────────────────────────────────────────────

export function AccountLoyaltyPage() {
  const { data, isPending, isError, refetch } = useMyLoyalty();
  if (isPending) return <ListSkeleton rows={3} />;
  if (isError || !data)
    return <ErrorState message="Couldn't load your points." onRetry={() => void refetch()} />;
  return (
    <section aria-label="Loyalty" className="space-y-4">
      {!data.enabled && (
        <p className="rounded-md bg-surface-muted p-3 text-sm">
          The loyalty programme isn't running right now. Your points are kept safe.
        </p>
      )}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm text-muted-foreground">Your balance</p>
        <p className="text-4xl font-semibold" aria-label="Points balance">
          {data.points} <span className="text-lg font-normal text-muted-foreground">points</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Worth {formatMoney(data.points * data.pointValue, data.currency)}. Earn 1 point for every{" "}
          {formatMoney(data.currencyPerPoint, data.currency)} you spend, and ask your server or the
          cashier to use them on your bill.
        </p>
      </div>
      {data.transactions.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No points activity yet"
          text="Points appear here after your next visit."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {data.transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 p-3">
              <span>
                <span className="font-medium">{LOYALTY_TRANSACTION_LABELS[t.type]}</span>
                {t.note && <span className="text-muted-foreground"> · {t.note}</span>}
                <span className="block text-xs text-muted-foreground">
                  {formatDateTime(t.createdAt, "UTC")}
                </span>
              </span>
              <span
                className={t.points < 0 ? "tabular-nums text-danger" : "tabular-nums text-success"}
              >
                {t.points > 0 ? "+" : ""}
                {t.points}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Invoices & receipts ──────────────────────────────────────────

export function AccountInvoicesPage() {
  const { data, isPending, isError, refetch } = useMyInvoices();
  if (isPending) return <ListSkeleton rows={3} />;
  if (isError || !data)
    return <ErrorState message="Couldn't load your invoices." onRetry={() => void refetch()} />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No invoices yet"
        text="After a visit, ask the cashier to attach your account to the bill and your receipt will appear here."
      />
    );
  }
  return (
    <ul aria-label="Invoices" className="space-y-2">
      {data.map((inv) => (
        <li
          key={inv.billId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <div>
            <p className="font-medium">
              {inv.branchName} · {inv.location}
            </p>
            <p className="text-sm text-muted-foreground">
              {inv.billNumber} · {inv.paidAt ? formatDate(inv.paidAt.slice(0, 10)) : ""} ·{" "}
              {formatMoney(inv.total, inv.currency)}
              {inv.pointsEarned > 0 && ` · +${inv.pointsEarned} points`}
            </p>
          </div>
          {inv.receiptId && (
            <Link
              to={`/account/invoices/${inv.receiptId}`}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted"
            >
              View receipt
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AccountReceiptPage() {
  const { id } = useParams();
  const { data, isPending, isError, refetch } = useMyReceipt(id);
  const [error, setError] = useState<string | null>(null);
  if (isPending) return <ListSkeleton rows={5} />;
  if (isError || !data)
    return <ErrorState message="Couldn't load this receipt." onRetry={() => void refetch()} />;
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-sm items-center justify-between gap-2">
        <Link
          to="/account/invoices"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden /> Invoices
        </Link>
        <Button
          variant="outline"
          onClick={() =>
            void downloadReceiptPdf(
              data.id,
              `${data.receiptNumber}.pdf`,
              "/customers/me/receipts",
            ).catch((e) =>
              setError(e instanceof Error ? e.message : "Couldn't download the receipt."),
            )
          }
        >
          <Download className="size-4" aria-hidden /> Download PDF
        </Button>
      </div>
      <div className="mx-auto max-w-sm">
        <FormError message={error} />
      </div>
      <ReceiptView receipt={data} />
    </div>
  );
}

// ── Reviews ──────────────────────────────────────────────────────

function ReviewForm({ target, onDone }: { target: ReviewableDto; onDone: () => void }) {
  const create = useCreateReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      aria-label={`Review ${target.label}`}
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (rating === 0) return setError("Choose a star rating.");
        try {
          await create.mutateAsync({
            kind: target.kind,
            billId: target.billId,
            bookingId: target.bookingId,
            rating,
            comment: comment.trim() || undefined,
          });
          onDone();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't send your review.");
        }
      }}
    >
      <p className="font-medium">{target.label}</p>
      <StarInput value={rating} onChange={setRating} label="How was it?" />
      <TextAreaField
        label="Comment (optional)"
        value={comment}
        maxLength={1000}
        onChange={(e) => setComment(e.target.value)}
      />
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Sending…" : "Submit review"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AccountReviewsPage() {
  const reviewable = useReviewable();
  const mine = useMyReviews();
  const [writing, setWriting] = useState<string | null>(null);
  const key = (r: ReviewableDto) => r.billId ?? r.bookingId ?? "";

  if (reviewable.isPending || mine.isPending) return <ListSkeleton rows={3} />;
  if (reviewable.isError || mine.isError) {
    return <ErrorState message="Couldn't load your reviews." onRetry={() => void mine.refetch()} />;
  }
  return (
    <section aria-label="Reviews" className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-xl font-semibold">Tell us how it went</h2>
        {reviewable.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to review right now. Paid visits and finished stays appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {reviewable.data.map((r) => (
              <li key={key(r)}>
                {writing === key(r) ? (
                  <ReviewForm target={r} onDone={() => setWriting(null)} />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
                    <div>
                      <p className="font-medium">{r.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(r.date.slice(0, 10))}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setWriting(key(r))}
                      aria-label={`Write a review for ${r.label}`}
                    >
                      <Star className="size-4" aria-hidden /> Write a review
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-xl font-semibold">Your reviews</h2>
        {mine.data.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="No reviews yet"
            text="Reviews you write will be listed here."
          />
        ) : (
          <ul className="space-y-2">
            {mine.data.map((r) => (
              <li key={r.id} className="space-y-1 rounded-lg border border-border bg-surface p-4">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {r.branchName} <Stars rating={r.rating} />
                </p>
                {r.comment && <p className="text-sm">“{r.comment}”</p>}
                {r.response && (
                  <p className="rounded-md bg-surface-muted p-2.5 text-sm">
                    <span className="font-medium">Reply from the team:</span> {r.response}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
