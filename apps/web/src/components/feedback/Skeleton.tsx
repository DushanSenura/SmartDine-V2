import { cn } from "@/lib/utils";

/** Shimmer placeholder; the pulse is disabled automatically under reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}
