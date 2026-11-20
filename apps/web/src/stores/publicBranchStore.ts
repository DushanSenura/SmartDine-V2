import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PublicBranchState {
  /** Branch the visitor is browsing (menu, reservations). */
  branchId: string | null;
  select: (id: string) => void;
}

export const usePublicBranchStore = create<PublicBranchState>()(
  persist((set) => ({ branchId: null, select: (branchId) => set({ branchId }) }), {
    name: "smartdine-public-branch",
  }),
);
