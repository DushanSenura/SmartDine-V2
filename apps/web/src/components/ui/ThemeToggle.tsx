import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useThemeStore, type ThemeMode } from "@/stores/themeStore";

const options: { mode: ThemeMode; label: string; Icon: LucideIcon }[] = [
  { mode: "light", label: "Light theme", Icon: Sun },
  { mode: "system", label: "System theme", Icon: Monitor },
  { mode: "dark", label: "Dark theme", Icon: Moon },
];

export function ThemeToggle() {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex rounded-full border border-border bg-surface p-1"
    >
      {options.map(({ mode: value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          aria-label={label}
          onClick={() => setMode(value)}
          className={cn(
            "grid size-8 place-items-center rounded-full transition-colors",
            mode === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
