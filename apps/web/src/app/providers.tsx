import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { CustomCursor } from "@/components/layout/CustomCursor";
import { useSessionBootstrap } from "@/features/auth/hooks/useAuth";
import { useThemeEffect } from "@/stores/themeStore";

import { queryClient } from "./queryClient";

export function Providers({ children }: { children: ReactNode }) {
  useThemeEffect();
  useSessionBootstrap();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Honours the OS "reduce motion" setting for every animation in the app. */}
      <MotionConfig reducedMotion="user">
        {children}
        <CustomCursor />
      </MotionConfig>
    </QueryClientProvider>
  );
}
