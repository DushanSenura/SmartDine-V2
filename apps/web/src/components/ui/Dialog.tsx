import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
}

const sizes = { md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

/** Accessible modal (focus trap, Esc to close, labelled by title) with a short fade/scale entrance. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <RadixDialog.Content
          className={cn(
            "dialog-content fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-lg",
            sizes[size],
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <RadixDialog.Title className="font-display text-xl font-semibold">
                {title}
              </RadixDialog.Title>
              <RadixDialog.Description
                className={cn("text-sm text-muted-foreground", !description && "sr-only")}
              >
                {description ?? title}
              </RadixDialog.Description>
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
