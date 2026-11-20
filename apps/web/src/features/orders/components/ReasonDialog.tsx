import { useState } from "react";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Asks for an optional reason before a destructive order action. */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={description}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onConfirm(reason.trim());
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Reason (optional)"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" className="bg-danger text-white hover:bg-danger/90" disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
