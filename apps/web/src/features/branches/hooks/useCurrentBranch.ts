import { useAuth } from "@/features/auth/hooks/useAuth";
import { useBranchStore } from "@/stores/branchStore";

import { useBranches } from "../api/branchQueries";

/**
 * The branch the staff UI is working in. Non-owners are pinned to their own branch;
 * the owner picks one (defaulting to the first) with the header switcher.
 */
export function useCurrentBranch() {
  const { user } = useAuth();
  const selectedId = useBranchStore((state) => state.selectedBranchId);
  const { data: branches, isPending } = useBranches();

  const branch =
    user?.role === "OWNER"
      ? (branches?.find((b) => b.id === selectedId) ?? branches?.[0])
      : branches?.find((b) => b.id === user?.branchId);

  return { branch, branchId: branch?.id, branches: branches ?? [], isPending };
}
