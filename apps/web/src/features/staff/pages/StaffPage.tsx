import type { StaffDto } from "@smartdine/shared";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchRequired } from "@/features/branches/components/BranchRequired";

import { useDeleteStaff, useStaff } from "../api/staffQueries";
import { StaffFormDialog } from "../components/StaffFormDialog";

function StaffList({ branchId }: { branchId: string }) {
  const { user } = useAuth();
  const { data, isPending, isError, refetch } = useStaff(branchId);
  const remove = useDeleteStaff();
  const [editing, setEditing] = useState<StaffDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<StaffDto | null>(null);

  return (
    <>
      <PageHeader
        title="Staff"
        description="Accounts, roles and HR profiles for this branch."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> New staff member
          </Button>
        }
      />
      {isPending && <ListSkeleton />}
      {isError && <ErrorState message="Couldn't load staff." onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={Users}
          title="No staff in this branch"
          text="Add waiters, kitchen staff and cashiers so they can sign in."
          action={<Button onClick={() => setEditing("new")}>Add staff member</Button>}
        />
      )}
      {!!data?.length && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Employee ID</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {member.firstName} {member.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{member.role.toLowerCase()}</td>
                  <td className="px-4 py-3">{member.employeeId ?? "—"}</td>
                  <td className="px-4 py-3">{member.department ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={member.status === "ACTIVE" ? "success" : "danger"}>
                      {(member.employmentStatus ?? member.status)
                        .replaceAll("_", " ")
                        .toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${member.firstName}`}
                      onClick={() => setEditing(member)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    {member.id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${member.firstName}`}
                        onClick={() => setDeleting(member)}
                      >
                        <Trash2 className="size-4 text-danger" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <StaffFormDialog
          key={editing === "new" ? "new" : editing.id}
          member={editing === "new" ? undefined : editing}
          defaultBranchId={branchId}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove ${deleting?.firstName ?? "staff member"}?`}
        description="Their account is disabled and signed out everywhere, and their table assignments are cleared."
        confirmLabel="Remove"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  );
}

export function StaffPage() {
  return <BranchRequired>{(branchId) => <StaffList branchId={branchId} />}</BranchRequired>;
}
