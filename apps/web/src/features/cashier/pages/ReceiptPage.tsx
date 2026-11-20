import { Download, Mail, Printer } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";

import { useEmailReceipt, useReceipt } from "../api/cashierQueries";
import { ReceiptView } from "../components/ReceiptView";
import { downloadReceiptPdf } from "../utils/receiptFile";

export function ReceiptPage() {
  const { id } = useParams();
  const { data, isPending, isError, refetch } = useReceipt(id);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const email = useEmailReceipt();

  if (isPending) return <ListSkeleton rows={6} />;
  if (isError || !data)
    return <ErrorState message="Couldn't load this receipt." onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-sm flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">Receipt {data.receiptNumber}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
          <Button
            onClick={() =>
              void downloadReceiptPdf(data.id, `${data.receiptNumber}.pdf`).catch((e) =>
                setError(e instanceof Error ? e.message : "Couldn't download the receipt."),
              )
            }
          >
            <Download className="size-4" aria-hidden /> Download PDF
          </Button>
        </div>
      </div>
      <form
        className="mx-auto flex max-w-sm items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setNotice(null);
          email.mutate(
            { id: data.id, to: to.trim() || undefined },
            {
              onSuccess: (r) => setNotice(`Receipt emailed to ${r.sentTo}.`),
              onError: (err) => setError(err.message),
            },
          );
        }}
      >
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Email receipt to</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="guest@example.com"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          />
        </label>
        <Button type="submit" variant="outline" disabled={email.isPending}>
          <Mail className="size-4" aria-hidden /> {email.isPending ? "Sending…" : "Email"}
        </Button>
      </form>
      <div className="mx-auto max-w-sm">
        <FormError message={error} />
        {notice && (
          <p role="status" className="text-sm text-success">
            {notice}
          </p>
        )}
      </div>
      <ReceiptView receipt={data} />
    </div>
  );
}
