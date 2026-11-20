import type { Permission } from "@smartdine/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { refreshSession } from "@/services/api/client";
import { disconnectSocket } from "@/services/socket/socket";
import { useAuthStore } from "@/stores/authStore";

import { authApi } from "../api/authApi";

/** Restores the session from the refresh cookie once on app start. */
export function useSessionBootstrap() {
  useEffect(() => {
    refreshSession().catch(() => useAuthStore.getState().clear());
  }, []);
}

export function useAuth() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const can = useCallback(
    (permission: Permission) => !!user?.permissions.includes(permission),
    [user],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      useAuthStore.getState().clear();
      disconnectSocket();
      queryClient.clear();
    }
  }, [queryClient]);

  return { status, user, can, logout, isStaff: !!user && user.role !== "CUSTOMER" };
}
