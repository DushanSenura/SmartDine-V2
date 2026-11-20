import { zodResolver } from "@hookform/resolvers/zod";
import {
  BRANCH_STATUSES,
  createBranchSchema,
  type BranchDto,
  type CreateBranchInput,
} from "@smartdine/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { FormError } from "@/features/auth/components/FormError";
import { SelectField } from "@/components/forms/fields";
import { OpeningHoursEditor } from "@/components/forms/OpeningHoursEditor";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useStaff } from "@/features/staff/api/staffQueries";

import { useSaveBranch } from "../api/branchQueries";

const STATUS_LABELS: Record<(typeof BRANCH_STATUSES)[number], string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  TEMPORARILY_CLOSED: "Temporarily closed",
  MAINTENANCE: "Maintenance",
};

export function BranchFormDialog({
  branch,
  open,
  onOpenChange,
}: {
  branch?: BranchDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveBranch();
  const [error, setError] = useState<string | null>(null);
  // Candidate managers: only available once a branch exists to look them up under.
  const managers = useStaff(branch?.id, "MANAGER");

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateBranchInput>({
    resolver: zodResolver(createBranchSchema) as never,
    defaultValues: branch
      ? { ...branch, managerId: branch.managerId }
      : { status: "OPEN", openingHours: null },
  });

  const onSubmit = handleSubmit(async (input) => {
    setError(null);
    try {
      await save.mutateAsync({ id: branch?.id, input });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={branch ? "Edit branch" : "New branch"}
      description="Location, contact details and weekly opening hours."
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" error={errors.name?.message} {...register("name")} />
          <TextField
            label="Code"
            hint="Short unique code, e.g. COL-01"
            error={errors.code?.message}
            {...register("code")}
          />
          <TextField label="City" error={errors.city?.message} {...register("city")} />
          <SelectField
            label="Status"
            options={BRANCH_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
            {...register("status")}
          />
          <TextField label="Address" className="sm:col-span-2" {...register("address")} />
          <TextField
            label="Phone"
            type="tel"
            error={errors.phone?.message}
            {...register("phone")}
          />
          <TextField
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register("email", { setValueAs: (v: string) => v || null })}
          />
          <TextField
            label="Latitude"
            type="number"
            step="any"
            error={errors.latitude?.message}
            {...register("latitude", { setValueAs: (v: string) => (v === "" ? null : Number(v)) })}
          />
          <TextField
            label="Longitude"
            type="number"
            step="any"
            error={errors.longitude?.message}
            {...register("longitude", { setValueAs: (v: string) => (v === "" ? null : Number(v)) })}
          />
          {branch && (
            <SelectField
              label="Branch manager"
              placeholder="No manager"
              options={(managers.data ?? []).map((m) => ({
                value: m.id,
                label: `${m.firstName} ${m.lastName}`,
              }))}
              hint="Managers are assigned from the Staff page first; pick from those working here."
              {...register("managerId", { setValueAs: (v: string) => v || null })}
            />
          )}
        </div>
        <Controller
          control={control}
          name="openingHours"
          render={({ field }) => (
            <OpeningHoursEditor value={field.value} onChange={field.onChange} />
          )}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : branch ? "Save changes" : "Create branch"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
