import { Building2 } from "lucide-react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { useBranchStore } from "@/stores/branchStore";

import { useCurrentBranch } from "../hooks/useCurrentBranch";

/** Header control: owners switch working branch; other staff just see their branch name. */
export function BranchSwitcher() {
  const { user } = useAuth();
  const { branch, branches } = useCurrentBranch();
  const select = useBranchStore((state) => state.select);

  if (!branch) return null;
  if (user?.role !== "OWNER" || branches.length < 2) {
    return (
      <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
        <Building2 className="size-4" aria-hidden /> {branch.name}
      </span>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <Building2 className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">Working branch</span>
      <select
        value={branch.id}
        onChange={(e) => select(e.target.value)}
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
