import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

// The storage key and `state.mode` shape are read by the inline script in index.html.
export const useThemeStore = create<ThemeState>()(
  persist((set) => ({ mode: "system", setMode: (mode) => set({ mode }) }), {
    name: "smartdine-theme",
  }),
);

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && prefersDark().matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Keeps the <html> class in sync with the stored mode and the OS preference. */
export function useThemeEffect() {
  const mode = useThemeStore((state) => state.mode);

  useEffect(() => {
    applyTheme(mode);
    if (mode !== "system") return;
    const query = prefersDark();
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [mode]);
}
