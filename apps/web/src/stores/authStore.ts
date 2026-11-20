import type { AuthSession, AuthUser } from "@smartdine/shared";
import { create } from "zustand";

type SessionStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  status: SessionStatus;
  user: AuthUser | null;
  /** Kept in memory only — never in storage. The refresh cookie restores it after a reload. */
  accessToken: string | null;
  setSession: (session: AuthSession) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  accessToken: null,
  setSession: ({ accessToken, user }) => set({ status: "authenticated", accessToken, user }),
  setUser: (user) => set({ user }),
  clear: () => set({ status: "anonymous", accessToken: null, user: null }),
}));
