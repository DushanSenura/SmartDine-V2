import { Building2 } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState, ListSkeleton } from "@/components/feedback/EmptyState";
import { useAuth } from "@/features/auth/hooks/useAuth";

import { useCurrentBranch } from "../hooks/useCurrentBranch";

/** Renders `children(branchId)` once a working branch is known, else a loading / guidance state. */
export function BranchRequired({ children }: { children: (branchId: string) => React.ReactNode }) {
  const { branchId, isPending } = useCurrentBranch();
  const { user } = useAuth();

  if (isPending) return <ListSkeleton />;
  if (!branchId) {
    return (
      <EmptyState
        icon={Building2}
        title={user?.role === "OWNER" ? "No branch yet" : "No branch assigned"}
        text={
          user?.role === "OWNER"
            ? "Create a branch first, then come back to configure it."
            : "Ask an owner to assign your account to a branch."
        }
        action={
          user?.role === "OWNER" ? (
            <Link
              to="/app/branches"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Go to branches
            </Link>
          ) : undefined
        }
      />
    );
  }
  return <>{children(branchId)}</>;
}
