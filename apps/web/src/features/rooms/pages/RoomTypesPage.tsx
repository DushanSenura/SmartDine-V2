import { zodResolver } from "@hookform/resolvers/zod";
import {
  BED_TYPES,
  createExtraSchema,
  createRoomTypeSchema,
  EXTRA_PRICING_MODES,
  ROOM_AMENITIES,
  type CreateExtraInput,
  type CreateRoomTypeInput,
  type RoomExtraDto,
  type RoomTypeDto,
} from "@smartdine/shared";
import { BedDouble, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField, TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { formatMoney, titleCase } from "@/utils/format";

import {
  useAdminExtras,
  useAdminRoomTypes,
  useDeleteExtra,
  useDeleteRoomType,
  useSaveExtra,
  useSaveRoomType,
} from "../api/roomQueries";
import { RoomVisual } from "../components/RoomParts";

const num = { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) };
const nullableNum = { setValueAs: (v: string) => (v === "" || v == null ? null : Number(v)) };
const nullableText = { setValueAs: (v: string) => (v === "" ? null : v) };

function RoomTypeDialog({
  branchId,
  type,
  onClose,
}: {
  branchId: string;
  type?: RoomTypeDto;
  onClose: () => void;
}) {
  const save = useSaveRoomType();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateRoomTypeInput>({
    resolver: zodResolver(createRoomTypeSchema) as never,
    defaultValues: type
      ? { ...type, branchId, amenities: type.amenities as CreateRoomTypeInput["amenities"] }
      : {
          branchId,
          bedType: "DOUBLE",
          numberOfBeds: 1,
          maximumGuests: 2,
          images: [],
          amenities: [],
          status: "ACTIVE",
        },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={type ? `Edit ${type.name}` : "New room type"}
      description="What guests see when choosing a room."
      size="lg"
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (input) => {
          setError(null);
          try {
            const { branchId: _unused, ...update } = input;
            await save.mutateAsync({ id: type?.id, input: type ? update : input });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        })}
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" error={errors.name?.message} {...register("name")} />
          <SelectField
            label="Status"
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive (hidden)" },
            ]}
            {...register("status")}
          />
          <TextField
            label="Maximum guests"
            type="number"
            error={errors.maximumGuests?.message}
            {...register("maximumGuests", num)}
          />
          <SelectField
            label="Bed type"
            options={BED_TYPES.map((b) => ({ value: b, label: titleCase(b) }))}
            {...register("bedType")}
          />
          <TextField
            label="Number of beds"
            type="number"
            error={errors.numberOfBeds?.message}
            {...register("numberOfBeds", num)}
          />
          <TextField label="Room size (m²)" type="number" {...register("roomSize", nullableNum)} />
          <TextField
            label="Base price / night"
            type="number"
            step="0.01"
            error={errors.basePrice?.message}
            {...register("basePrice", num)}
          />
          <TextField
            label="Weekend price / night"
            type="number"
            step="0.01"
            hint="Friday and Saturday nights. Blank = base price."
            {...register("weekendPrice", nullableNum)}
          />
        </div>
        <TextAreaField label="Description" {...register("description", nullableText)} />
        <Controller
          control={control}
          name="images"
          render={({ field }) => (
            <TextAreaField
              label="Image URLs"
              hint="One http(s) URL per line"
              error={
                errors.images?.message ??
                (errors.images as { message?: string }[] | undefined)?.find?.(Boolean)?.message
              }
              defaultValue={field.value?.join("\n")}
              onChange={(e) =>
                field.onChange(
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          )}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Amenities</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ROOM_AMENITIES.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <Controller
                  control={control}
                  name="amenities"
                  render={({ field }) => (
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={field.value?.includes(a) ?? false}
                      onChange={(e) =>
                        field.onChange(
                          e.target.checked
                            ? [...(field.value ?? []), a]
                            : (field.value ?? []).filter((x) => x !== a),
                        )
                      }
                    />
                  )}
                />
                {a}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save room type"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ExtraDialog({
  branchId,
  extra,
  onClose,
}: {
  branchId: string;
  extra?: RoomExtraDto;
  onClose: () => void;
}) {
  const save = useSaveExtra();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateExtraInput>({
    resolver: zodResolver(createExtraSchema) as never,
    defaultValues: extra ?? { branchId, pricingMode: "PER_STAY", isActive: true },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={extra ? `Edit ${extra.name}` : "New extra"}
      description="Optional add-ons guests can choose when booking."
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (input) => {
          setError(null);
          try {
            const { branchId: _unused, ...update } = input;
            await save.mutateAsync({ id: extra?.id, input: extra ? update : input });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        })}
      >
        <FormError message={error} />
        <TextField label="Name" error={errors.name?.message} {...register("name")} />
        <TextField label="Description" {...register("description", nullableText)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Price"
            type="number"
            step="0.01"
            error={errors.price?.message}
            {...register("price", num)}
          />
          <SelectField
            label="Charged"
            options={EXTRA_PRICING_MODES.map((m) => ({
              value: m,
              label: m === "PER_NIGHT" ? "Per night" : m === "PER_GUEST" ? "Per guest" : "Per stay",
            }))}
            {...register("pricingMode")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            {...register("isActive")}
          />{" "}
          Offered to guests
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save extra"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Content({ branchId }: { branchId: string }) {
  const { branch } = useCurrentBranch();
  const currency = branch?.currency ?? "LKR";
  const types = useAdminRoomTypes(branchId);
  const extras = useAdminExtras(branchId);
  const removeType = useDeleteRoomType();
  const removeExtra = useDeleteExtra();
  const [editingType, setEditingType] = useState<RoomTypeDto | "new" | null>(null);
  const [editingExtra, setEditingExtra] = useState<RoomExtraDto | "new" | null>(null);
  const [deletingType, setDeletingType] = useState<RoomTypeDto | null>(null);
  const [deletingExtra, setDeletingExtra] = useState<RoomExtraDto | null>(null);

  return (
    <>
      <PageHeader
        title="Room types"
        description="What you sell: pricing, beds, amenities and photos."
        actions={
          <Button onClick={() => setEditingType("new")}>
            <Plus className="size-4" aria-hidden /> New room type
          </Button>
        }
      />
      {types.isPending && <ListSkeleton />}
      {types.isError && (
        <ErrorState message="Couldn't load room types." onRetry={() => void types.refetch()} />
      )}
      {types.data?.length === 0 && (
        <EmptyState
          icon={BedDouble}
          title="No room types yet"
          text="Create a type such as Standard or Deluxe, then add physical rooms to it."
          action={<Button onClick={() => setEditingType("new")}>Create a room type</Button>}
        />
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {types.data?.map((type) => (
          <li key={type.id} className="overflow-hidden rounded-xl border border-border bg-surface">
            <RoomVisual type={type} className="aspect-[16/6] w-full" />
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-display text-lg font-semibold">
                    {type.name} {type.status === "INACTIVE" && <Badge tone="warning">hidden</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Sleeps {type.maximumGuests} · {type.numberOfBeds} × {titleCase(type.bedType)} ·{" "}
                    {type.roomCount ?? 0} rooms
                  </p>
                </div>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${type.name}`}
                    onClick={() => setEditingType(type)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${type.name}`}
                    onClick={() => setDeletingType(type)}
                  >
                    <Trash2 className="size-4 text-danger" aria-hidden />
                  </Button>
                </div>
              </div>
              <p className="text-sm">
                {formatMoney(type.basePrice, currency)} / night
                {type.weekendPrice !== null && type.weekendPrice !== type.basePrice && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatMoney(type.weekendPrice, currency)} Fri–Sat
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="extras-title" className="mt-12 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="extras-title" className="font-display text-2xl font-semibold">
            Booking extras
          </h2>
          <Button variant="outline" onClick={() => setEditingExtra("new")}>
            <Plus className="size-4" aria-hidden /> New extra
          </Button>
        </div>
        {extras.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No extras yet. Guests will see none when booking.
          </p>
        )}
        <ul className="grid gap-2 md:grid-cols-2">
          {extras.data?.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {e.name} {!e.isActive && <Badge tone="warning">off</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(e.price, currency)}{" "}
                  {e.pricingMode === "PER_NIGHT"
                    ? "per night"
                    : e.pricingMode === "PER_GUEST"
                      ? "per guest"
                      : "per stay"}
                </p>
              </div>
              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${e.name}`}
                  onClick={() => setEditingExtra(e)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${e.name}`}
                  onClick={() => setDeletingExtra(e)}
                >
                  <Trash2 className="size-4 text-danger" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {editingType && (
        <RoomTypeDialog
          key={editingType === "new" ? "new" : editingType.id}
          branchId={branchId}
          type={editingType === "new" ? undefined : editingType}
          onClose={() => setEditingType(null)}
        />
      )}
      {editingExtra && (
        <ExtraDialog
          key={editingExtra === "new" ? "new" : editingExtra.id}
          branchId={branchId}
          extra={editingExtra === "new" ? undefined : editingExtra}
          onClose={() => setEditingExtra(null)}
        />
      )}
      <ConfirmDialog
        open={!!deletingType}
        onOpenChange={(open) => !open && setDeletingType(null)}
        title={`Delete ${deletingType?.name ?? "room type"}?`}
        description="Room types that still have rooms cannot be deleted."
        onConfirm={() => removeType.mutateAsync(deletingType!.id)}
      />
      <ConfirmDialog
        open={!!deletingExtra}
        onOpenChange={(open) => !open && setDeletingExtra(null)}
        title={`Delete ${deletingExtra?.name ?? "extra"}?`}
        description="Past bookings keep their record of this extra."
        onConfirm={() => removeExtra.mutateAsync(deletingExtra!.id)}
      />
    </>
  );
}

export function RoomTypesPage() {
  return <BranchRequired>{(branchId) => <Content branchId={branchId} />}</BranchRequired>;
}
