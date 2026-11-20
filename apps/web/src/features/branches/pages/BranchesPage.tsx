import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BranchDto } from "@smartdine/shared";

import { useBranches, useDeleteBranch } from "../api/branchQueries";
import { BranchFormDialog } from "../components/BranchFormDialog";

const TONES = {
  OPEN: "success",
  CLOSED: "neutral",
  TEMPORARILY_CLOSED: "warning",
  MAINTENANCE: "info",
} as const;

export function BranchesPage() {
  const { data, isPending, isError, refetch } = useBranches();
  const remove = useDeleteBranch();
  const [editing, setEditing] = useState<BranchDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<BranchDto | null>(null);

  return (
    <div>
      <PageHeader
        title="Branches"
        description="Every location of the company and its opening hours."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> New branch
          </Button>
        }
      />

      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load branches." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={Building2}
          title="No branches yet"
          text="Create your first branch to start configuring its floor, staff and menu."
          action={<Button onClick={() => setEditing("new")}>Create a branch</Button>}
        />
      )}

      <ul className="grid gap-3">
        {data?.map((branch) => (
          <li
            key={branch.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4"
          >
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium">
                {branch.name}{" "}
                <Badge tone={TONES[branch.status]}>
                  {branch.status.replaceAll("_", " ").toLowerCase()}
                </Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                {branch.code}
                {branch.city && ` · ${branch.city}`}
                {` · Manager: ${branch.managerName ?? "unassigned"}`}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${branch.name}`}
                onClick={() => setEditing(branch)}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${branch.name}`}
                onClick={() => setDeleting(branch)}
              >
                <Trash2 className="size-4 text-danger" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <BranchFormDialog
          key={editing === "new" ? "new" : editing.id}
          branch={editing === "new" ? undefined : editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "branch"}?`}
        description="The branch is closed and hidden. Its history is kept."
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </div>
  );
}
