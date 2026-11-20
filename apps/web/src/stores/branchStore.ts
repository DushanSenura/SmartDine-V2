import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BranchState {
  /** Owner's chosen working branch. Other roles are fixed to their account's branch. */
  selectedBranchId: string | null;
  select: (id: string | null) => void;
}

export const useBranchStore = create<BranchState>()(
  persist((set) => ({ selectedBranchId: null, select: (id) => set({ selectedBranchId: id }) }), {
    name: "smartdine-branch",
  }),
);
