import { zodResolver } from "@hookform/resolvers/zod";
import {
  createPrivateRoomSchema,
  type CreatePrivateRoomInput,
  type PrivateRoomDto,
} from "@smartdine/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { TextAreaField } from "@/components/forms/fields";
import { OpeningHoursEditor } from "@/components/forms/OpeningHoursEditor";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";

import { useSavePrivateRoom } from "../api/privateDiningQueries";

const num = { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) };
const nullable = { setValueAs: (v: string) => (v === "" ? null : v) };
const toList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

export function PrivateRoomDialog({
  branchId,
  room,
  onClose,
}: {
  branchId: string;
  room?: PrivateRoomDto;
  onClose: () => void;
}) {
  const save = useSavePrivateRoom();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreatePrivateRoomInput>({
    resolver: zodResolver(createPrivateRoomSchema) as never,
    defaultValues: room ?? {
      branchId,
      minimumGuests: 1,
      images: [],
      amenities: [],
      minimumSpend: 0,
      hourlyRate: 0,
      deposit: 0,
      openingTimes: null,
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={room ? `Edit ${room.name}` : "New private dining room"}
      description="Capacity, pricing and availability for private events."
      size="lg"
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (input) => {
          setError(null);
          try {
            await save.mutateAsync({ id: room?.id, input });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        })}
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" error={errors.name?.message} {...register("name")} />
          <TextField
            label="Capacity"
            type="number"
            error={errors.capacity?.message}
            {...register("capacity", num)}
          />
          <TextField
            label="Minimum guests"
            type="number"
            error={errors.minimumGuests?.message}
            {...register("minimumGuests", num)}
          />
          <TextField
            label="Maximum guests"
            type="number"
            error={errors.maximumGuests?.message}
            {...register("maximumGuests", num)}
          />
          <TextField
            label="Minimum spend"
            type="number"
            step="0.01"
            error={errors.minimumSpend?.message}
            {...register("minimumSpend", num)}
          />
          <TextField
            label="Hourly rate"
            type="number"
            step="0.01"
            error={errors.hourlyRate?.message}
            {...register("hourlyRate", num)}
          />
          <TextField
            label="Deposit"
            type="number"
            step="0.01"
            error={errors.deposit?.message}
            {...register("deposit", num)}
          />
        </div>
        <TextAreaField label="Description" {...register("description", nullable)} />
        <Controller
          control={control}
          name="amenities"
          render={({ field }) => (
            <TextField
              label="Amenities"
              hint="Comma-separated, e.g. Projector, Sound system"
              defaultValue={field.value?.join(", ")}
              onChange={(e) => field.onChange(toList(e.target.value))}
            />
          )}
        />
        <Controller
          control={control}
          name="images"
          render={({ field }) => (
            <TextAreaField
              label="Image URLs"
              hint="One URL per line"
              error={
                errors.images?.message ??
                (errors.images as { message?: string }[] | undefined)?.find?.(Boolean)?.message
              }
              defaultValue={field.value?.join("\n")}
              onChange={(e) => field.onChange(toList(e.target.value))}
            />
          )}
        />
        <TextAreaField label="Special rules" {...register("specialRules", nullable)} />
        <Controller
          control={control}
          name="openingTimes"
          render={({ field }) => (
            <OpeningHoursEditor
              legend="Available times"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save room"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
