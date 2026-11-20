import { zodResolver } from "@hookform/resolvers/zod";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STATUSES,
  createMenuItemSchema,
  KITCHEN_STATIONS,
  MEAL_PERIOD_LABELS,
  MEAL_PERIODS,
  updateMenuItemSchema,
  type CreateMenuItemInput,
  type MenuItemDto,
} from "@smartdine/shared";
import { useState } from "react";
import { Controller, useFieldArray, useForm, type UseFormRegisterReturn } from "react-hook-form";

import { SelectField, TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { titleCase } from "@/utils/format";

import { useAdminCategories, useAllergens, useSaveMenuItem } from "../api/menuQueries";

const nullableNumber = { setValueAs: (v: string) => (v === "" || v == null ? null : Number(v)) };
const required = { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) };
const nullableText = { setValueAs: (v: string) => (v === "" ? null : v) };
const toList = (text: string, separator: RegExp) =>
  text
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);

function Check({ label, registration }: { label: string; registration: UseFormRegisterReturn }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--primary)]" {...registration} />
      {label}
    </label>
  );
}

export function MenuItemFormDialog({
  branchId,
  item,
  onClose,
}: {
  branchId: string;
  item?: MenuItemDto;
  onClose: () => void;
}) {
  const categories = useAdminCategories();
  const allergens = useAllergens();
  const save = useSaveMenuItem();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateMenuItemInput>({
    resolver: zodResolver(
      (item ? updateMenuItemSchema : createMenuItemSchema) as typeof createMenuItemSchema,
    ) as never,
    defaultValues: item
      ? {
          ...item,
          allergenIds: item.allergens.map((a) => a.id),
          modifiers: item.modifiers.map(({ name, priceDelta, isActive }) => ({
            name,
            priceDelta,
            isActive,
          })),
        }
      : {
          branchId,
          modifiers: [],
          gallery: [],
          mealPeriods: [],
          allergenIds: [],
          tags: [],
          spiceLevel: 0,
          availability: "AVAILABLE",
          kitchenStation: "MAIN_KITCHEN",
        },
  });

  const modifiers = useFieldArray({ control, name: "modifiers" });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item ? `Edit ${item.name}` : "New dish"}
      description="Details shown to guests and used by the kitchen."
      size="xl"
    >
      <form
        noValidate
        className="space-y-5"
        onSubmit={handleSubmit(async (input) => {
          setError(null);
          try {
            await save.mutateAsync({ id: item?.id, input });
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
            label="Category"
            placeholder="Choose…"
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            error={errors.categoryId?.message}
            {...register("categoryId")}
          />
          <TextField
            label="Short description"
            className="sm:col-span-2"
            {...register("shortDescription", nullableText)}
          />
          <div className="sm:col-span-2">
            <TextAreaField label="Description" {...register("description", nullableText)} />
          </div>
          <TextField
            label="Price"
            type="number"
            step="0.01"
            error={errors.price?.message}
            {...register("price", required)}
          />
          <TextField
            label="Compare-at price"
            type="number"
            step="0.01"
            hint="Higher than price to show a discount"
            {...register("comparePrice", nullableNumber)}
          />
          <TextField
            label="Cost price (internal)"
            type="number"
            step="0.01"
            {...register("costPrice", nullableNumber)}
          />
          <TextField
            label="Image URL"
            type="url"
            error={errors.image?.message}
            {...register("image", nullableText)}
          />
          <TextField
            label="Preparation time (min)"
            type="number"
            {...register("preparationTime", nullableNumber)}
          />
          <TextField label="Calories" type="number" {...register("calories", nullableNumber)} />
          <SelectField
            label="Spice level"
            options={[
              { value: "0", label: "Not spicy" },
              { value: "1", label: "Mild" },
              { value: "2", label: "Medium" },
              { value: "3", label: "Hot" },
            ]}
            {...register("spiceLevel", { valueAsNumber: true })}
          />
          <SelectField
            label="Kitchen station"
            options={KITCHEN_STATIONS.map((s) => ({ value: s, label: titleCase(s) }))}
            {...register("kitchenStation")}
          />
          <SelectField
            label="Availability"
            options={AVAILABILITY_STATUSES.map((s) => ({
              value: s,
              label: AVAILABILITY_LABELS[s],
            }))}
            {...register("availability")}
          />
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <TextField
                label="Tags"
                hint="Comma-separated, searchable by guests"
                defaultValue={field.value?.join(", ")}
                onChange={(e) => field.onChange(toList(e.target.value, /,/))}
              />
            )}
          />
        </div>

        <Controller
          control={control}
          name="gallery"
          render={({ field }) => (
            <TextAreaField
              label="Gallery image URLs"
              hint="One URL per line"
              error={errors.gallery?.message}
              defaultValue={field.value?.join("\n")}
              onChange={(e) => field.onChange(toList(e.target.value, /\n/))}
            />
          )}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Served during</legend>
          <p className="text-xs text-muted-foreground">Leave all unchecked to serve all day.</p>
          <div className="flex flex-wrap gap-4">
            {MEAL_PERIODS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <Controller
                  control={control}
                  name="mealPeriods"
                  render={({ field }) => (
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={field.value?.includes(p) ?? false}
                      onChange={(e) =>
                        field.onChange(
                          e.target.checked
                            ? [...(field.value ?? []), p]
                            : (field.value ?? []).filter((x) => x !== p),
                        )
                      }
                    />
                  )}
                />
                {MEAL_PERIOD_LABELS[p]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Dietary & highlights</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Check label="Vegetarian" registration={register("vegetarian")} />
            <Check label="Vegan" registration={register("vegan")} />
            <Check label="Halal" registration={register("halal")} />
            <Check label="Featured" registration={register("featured")} />
            <Check label="Popular" registration={register("popular")} />
            <Check label="New" registration={register("newItem")} />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Allergens</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {allergens.data?.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <Controller
                  control={control}
                  name="allergenIds"
                  render={({ field }) => (
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={field.value?.includes(a.id) ?? false}
                      onChange={(e) =>
                        field.onChange(
                          e.target.checked
                            ? [...(field.value ?? []), a.id]
                            : (field.value ?? []).filter((x) => x !== a.id),
                        )
                      }
                    />
                  )}
                />
                {a.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Options & extras</legend>
          <p className="text-xs text-muted-foreground">
            Add-ons waiters can pick when ordering, e.g. “Extra cheese”. Inactive options are
            hidden.
          </p>
          {modifiers.fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap items-end gap-2">
              <TextField
                label="Option name"
                className="min-w-40 flex-1"
                error={errors.modifiers?.[index]?.name?.message}
                {...register(`modifiers.${index}.name`)}
              />
              <TextField
                label="Price change"
                type="number"
                step="0.01"
                className="w-32"
                {...register(`modifiers.${index}.priceDelta`, { valueAsNumber: true })}
              />
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  {...register(`modifiers.${index}.isActive`)}
                />
                Active
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove option ${index + 1}`}
                onClick={() => modifiers.remove(index)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => modifiers.append({ name: "", priceDelta: 0, isActive: true })}
          >
            Add option
          </Button>
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save dish"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
