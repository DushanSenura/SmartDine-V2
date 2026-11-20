import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCircle2, Info, X, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useToastStore, type ToastTone } from "@/stores/toastStore";

const TONES: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Bell, className: "text-info" },
  success: { icon: CheckCircle2, className: "text-success" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  danger: { icon: Info, className: "text-danger" },
};

/**
 * Transient messages, bottom-right (full width on a phone). The region is a polite live region, so a
 * screen reader hears each toast without losing its place. Escape-free by design: toasts never take focus.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const navigate = useNavigate();

  return (
    <div
      role="region"
      aria-label="Toast messages"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const { icon: Icon, className } = TONES[item.tone];
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="bg-surface pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-3 shadow-lg"
            >
              <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", className)} />
              <div className="min-w-0 flex-1">
                {item.to ? (
                  <button
                    type="button"
                    className="block w-full text-left text-sm font-medium hover:underline"
                    onClick={() => {
                      dismiss(item.id);
                      void navigate(item.to!);
                    }}
                  >
                    {item.title}
                  </button>
                ) : (
                  <p className="text-sm font-medium">{item.title}</p>
                )}
                {item.description && (
                  <p className="text-muted-foreground mt-0.5 text-sm">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground -m-1 rounded p-1"
                onClick={() => dismiss(item.id)}
              >
                <X aria-hidden className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
