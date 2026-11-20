import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** Progress indicator; completed steps can be revisited. */
export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: string[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol aria-label="Booking progress" className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((label, index) => {
        const done = index < current;
        return (
          <li
            key={label}
            className="flex items-center gap-2"
            aria-current={index === current ? "step" : undefined}
          >
            <button
              type="button"
              disabled={!done}
              onClick={() => onSelect(index)}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-colors",
                index === current && "bg-primary text-primary-foreground",
                done && "bg-primary/10 text-primary hover:bg-primary/20",
                index > current && "bg-surface-muted text-muted-foreground",
              )}
            >
              <span className="grid size-5 place-items-center rounded-full bg-background/30 text-xs">
                {done ? <Check className="size-3" aria-hidden /> : index + 1}
              </span>
              {label}
            </button>
            {index < steps.length - 1 && <span aria-hidden className="h-px w-4 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
