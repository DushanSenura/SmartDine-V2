import { cn } from "@/lib/utils";

/**
 * The SmartDine emblem next to the wordmark. The logo artwork has a light background, so it sits on a
 * small rounded tile that reads the same in light and dark themes. The image is decorative: the
 * wordmark beside it is the accessible name.
 */
export function Brand({
  className,
  textClassName,
  size = "md",
}: {
  className?: string;
  textClassName?: string;
  size?: "sm" | "md";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/icons/logo-mark-64.png"
        srcSet="/icons/logo-mark-64.png 1x, /icons/logo-mark-192.png 3x"
        alt=""
        width={size === "sm" ? 28 : 36}
        height={size === "sm" ? 28 : 36}
        className={cn("shrink-0 rounded-lg shadow-sm", size === "sm" ? "size-7" : "size-9")}
      />
      <span
        className={cn(
          "font-display font-semibold tracking-tight text-primary",
          size === "sm" ? "text-lg" : "text-xl",
          textClassName,
        )}
      >
        SmartDine
      </span>
    </span>
  );
}
