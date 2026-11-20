import { zodResolver } from "@hookform/resolvers/zod";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  updateCompanySchema,
  updateCompanySettingsSchema,
} from "@smartdine/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";

import { useSaveSettings, useSettings, type SettingsDto } from "../api/settingsQueries";

const formSchema = z.object({
  company: updateCompanySchema,
  settings: updateCompanySettingsSchema,
});
type FormValues = z.input<typeof formSchema>;

const num = { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) };
const nullable = { setValueAs: (v: string) => (v === "" ? null : v) };

function SettingsForm({ data }: { data: SettingsDto }) {
  const save = useSaveSettings();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: data,
  });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={handleSubmit(async (values) => {
        setError(null);
        setSaved(false);
        try {
          await save.mutateAsync(formSchema.parse(values));
          setSaved(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
        }
      })}
    >
      <FormError message={error} />
      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-display text-xl font-semibold">Company</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Company name"
            error={errors.company?.name?.message}
            {...register("company.name")}
          />
          <TextField
            label="Currency"
            hint="3-letter code, e.g. LKR"
            error={errors.company?.currency?.message}
            {...register("company.currency")}
          />
          <TextField
            label="Timezone"
            hint="IANA name, e.g. Asia/Colombo"
            {...register("company.timezone")}
          />
          <TextField label="Phone" type="tel" {...register("company.phone", nullable)} />
          <TextField
            label="Email"
            type="email"
            error={errors.company?.email?.message}
            {...register("company.email", nullable)}
          />
          <TextField
            label="Logo URL"
            type="url"
            error={errors.company?.logoUrl?.message}
            {...register("company.logoUrl", nullable)}
          />
          <TextField
            label="Address"
            className="sm:col-span-2"
            {...register("company.address", nullable)}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-display text-xl font-semibold">Billing & bookings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Default tax (%)"
            type="number"
            step="0.01"
            error={errors.settings?.taxRatePercent?.message}
            {...register("settings.taxRatePercent", num)}
          />
          <TextField
            label="Service charge (%)"
            type="number"
            step="0.01"
            error={errors.settings?.serviceChargePercent?.message}
            {...register("settings.serviceChargePercent", num)}
          />
          <TextField
            label="Reservation duration (minutes)"
            type="number"
            error={errors.settings?.reservationDurationMinutes?.message}
            {...register("settings.reservationDurationMinutes", num)}
          />
          <TextField
            label="Free cancellation window (hours)"
            type="number"
            error={errors.settings?.cancellationWindowHours?.message}
            {...register("settings.cancellationWindowHours", num)}
          />
          <TextField
            label="Room deposit (%)"
            type="number"
            step="0.01"
            hint="Share of a room booking due to secure it"
            error={errors.settings?.roomDepositPercent?.message}
            {...register("settings.roomDepositPercent", num)}
          />
          <TextField
            label="Check-in time"
            type="time"
            error={errors.settings?.checkInTime?.message}
            {...register("settings.checkInTime")}
          />
          <TextField
            label="Check-out time"
            type="time"
            error={errors.settings?.checkOutTime?.message}
            {...register("settings.checkOutTime")}
          />
          <div className="sm:col-span-2">
            <TextAreaField
              label="Receipt footer"
              {...register("settings.receiptFooter", nullable)}
            />
          </div>
        </div>
      </section>

      <section
        aria-label="Payments"
        className="space-y-4 rounded-xl border border-border bg-surface p-5"
      >
        <div>
          <h2 className="font-display text-xl font-semibold">Payments</h2>
          <p className="text-sm text-muted-foreground">
            What the till accepts, and how far a cashier can discount before they need a manager.
          </p>
        </div>
        <TextField
          label="Cashier discount limit (%)"
          type="number"
          step="0.01"
          hint="Larger discounts need a manager. Promo codes are exempt."
          error={errors.settings?.cashierDiscountLimitPercent?.message}
          {...register("settings.cashierDiscountLimitPercent", num)}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Accepted payment methods</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {PAYMENT_METHODS.filter((m) => m !== "LOYALTY_POINTS").map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={m}
                  className="size-4 accent-[var(--primary)]"
                  {...register("settings.enabledPaymentMethods")}
                />
                {PAYMENT_METHOD_LABELS[m]}
              </label>
            ))}
          </div>
          {errors.settings?.enabledPaymentMethods?.message && (
            <p role="alert" className="text-xs text-danger">
              {errors.settings.enabledPaymentMethods.message}
            </p>
          )}
        </fieldset>
      </section>

      <section
        aria-label="Loyalty programme"
        className="space-y-4 rounded-xl border border-border bg-surface p-5"
      >
        <div>
          <h2 className="font-display text-xl font-semibold">Loyalty programme</h2>
          <p className="text-sm text-muted-foreground">
            Customers earn points on what they pay, and can spend them on a bill. Switching it off
            keeps everyone's points.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            {...register("settings.loyaltyEnabled")}
          />
          Loyalty programme is on
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Spend per point"
            type="number"
            step="0.01"
            hint="Money spent to earn 1 point, e.g. 100 means LKR 100 = 1 point"
            error={errors.settings?.loyaltyCurrencyPerPoint?.message}
            {...register("settings.loyaltyCurrencyPerPoint", num)}
          />
          <TextField
            label="Value of a point"
            type="number"
            step="0.01"
            hint="Money one point is worth when it is spent on a bill"
            error={errors.settings?.loyaltyPointValue?.message}
            {...register("settings.loyaltyPointValue", num)}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-success">
            Settings saved
          </span>
        )}
      </div>
    </form>
  );
}

export function SettingsPage() {
  const { data, isPending, isError, refetch } = useSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Company details, tax and booking rules." />
      {isPending && <ListSkeleton rows={5} />}
      {isError && <ErrorState message="Couldn't load settings." onRetry={() => void refetch()} />}
      {data && <SettingsForm data={data} />}
    </div>
  );
}
