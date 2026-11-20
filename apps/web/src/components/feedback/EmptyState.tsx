import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger"
    >
      {message}{" "}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline underline-offset-4"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg bg-surface-muted motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
