import { zodResolver } from "@hookform/resolvers/zod";
import {
  ASSIGNABLE_ROLES,
  createStaffSchema,
  EMPLOYMENT_STATUSES,
  updateStaffSchema,
  type CreateStaffInput,
  type Role,
  type StaffDto,
} from "@smartdine/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useBranches } from "@/features/branches/api/branchQueries";

import { useSaveStaff } from "../api/staffQueries";

const label = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
const emptyToNull = { setValueAs: (v: string) => (v === "" ? null : v) };

export function StaffFormDialog({
  member,
  defaultBranchId,
  open,
  onOpenChange,
}: {
  member?: StaffDto;
  defaultBranchId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: branches } = useBranches();
  const save = useSaveStaff();
  const [error, setError] = useState<string | null>(null);
  const roles = user ? ASSIGNABLE_ROLES[user.role] : [];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateStaffInput>({
    // Editing uses the partial schema (no email / required password).
    resolver: zodResolver(
      (member ? updateStaffSchema : createStaffSchema) as typeof createStaffSchema,
    ),
    defaultValues: member
      ? ({ ...member, password: undefined } as unknown as CreateStaffInput)
      : { branchId: defaultBranchId, role: roles.find((r) => r === "WAITER") ?? roles[0] },
  });

  const onSubmit = handleSubmit(async (input) => {
    setError(null);
    try {
      if (member) {
        // Email is immutable; empty password means "leave unchanged".
        const { email: _email, password, ...rest } = input;
        await save.mutateAsync({
          id: member.id,
          input: { ...rest, ...(password ? { password } : {}) },
        });
      } else {
        await save.mutateAsync({ input });
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={member ? `Edit ${member.firstName} ${member.lastName}` : "New staff member"}
      description="Account, role and HR profile."
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            error={errors.firstName?.message}
            {...register("firstName")}
          />
          <TextField label="Last name" error={errors.lastName?.message} {...register("lastName")} />
          <TextField
            label="Email"
            type="email"
            disabled={!!member}
            error={errors.email?.message}
            {...register("email")}
          />
          <TextField
            label={member ? "Reset password (optional)" : "Initial password"}
            type="password"
            autoComplete="new-password"
            hint="10+ characters with upper, lower case and a number."
            error={errors.password?.message}
            {...register("password", { setValueAs: (v: string) => v || undefined })}
          />
          <SelectField
            label="Role"
            options={roles.map((r: Role) => ({ value: r, label: label(r) }))}
            error={errors.role?.message}
            {...register("role")}
          />
          <SelectField
            label="Branch"
            disabled={user?.role !== "OWNER"}
            options={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))}
            error={errors.branchId?.message}
            {...register("branchId")}
          />
          <TextField
            label="Phone"
            type="tel"
            error={errors.phone?.message}
            {...register("phone", { setValueAs: (v: string) => v || undefined })}
          />
          <TextField
            label="Employee ID"
            hint="Leave blank to generate"
            error={errors.employeeId?.message}
            {...register("employeeId", { setValueAs: (v: string) => v || undefined })}
          />
          <TextField label="Department" {...register("department", emptyToNull)} />
          <SelectField
            label="Employment status"
            options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))}
            {...register("employmentStatus", { setValueAs: (v: string) => v || undefined })}
          />
          <TextField label="Hire date" type="date" {...register("hireDate", emptyToNull)} />
          <TextField label="Date of birth" type="date" {...register("dateOfBirth", emptyToNull)} />
          <TextField
            label="Address"
            className="sm:col-span-2"
            {...register("address", emptyToNull)}
          />
          <TextField label="Emergency contact" {...register("emergencyContactName", emptyToNull)} />
          <TextField
            label="Emergency phone"
            type="tel"
            {...register("emergencyContactPhone", emptyToNull)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : member ? "Save changes" : "Create account"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
