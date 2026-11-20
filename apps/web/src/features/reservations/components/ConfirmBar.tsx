import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";

/**
 * Final step control. Browsing and availability are public; confirming needs a customer account,
 * so visitors are sent to sign in / register and returned here with their choices intact.
 */
export function ConfirmBar({
  busy,
  error,
  confirmLabel,
  onBack,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  confirmLabel: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { user, status } = useAuth();
  const location = useLocation();
  const returnTo = { from: `${location.pathname}${location.search}` };

  if (status !== "loading" && !user) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
        <p className="text-sm">
          Sign in or create an account to confirm. Your choices will be kept.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/login"
            state={returnTo}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            state={returnTo}
            className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
          >
            Create account
          </Link>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (user && user.role !== "CUSTOMER") {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-danger">
          Staff accounts can't book online. Use Reservations in the staff dashboard instead.
        </p>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="button" onClick={onConfirm} disabled={busy || status === "loading"}>
          {busy ? "Booking…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
