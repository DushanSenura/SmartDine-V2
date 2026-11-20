import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-surface-muted text-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-foreground",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
