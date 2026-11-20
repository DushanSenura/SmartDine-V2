import { zodResolver } from "@hookform/resolvers/zod";
import { createReservationSchema } from "@smartdine/shared";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";

const contactSchema = createReservationSchema.pick({
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  specialRequest: true,
});

export type ContactValues = z.input<typeof contactSchema>;

/** Name / email / phone / special request. Defaults to the signed-in customer's profile. */
export function ContactStep({
  initial,
  specialRequestLabel = "Special requests (optional)",
  onSubmit,
  onBack,
}: {
  initial: Partial<ContactValues>;
  specialRequestLabel?: string;
  onSubmit: (values: ContactValues) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema) as never,
    defaultValues: {
      guestName: initial.guestName ?? (user ? `${user.firstName} ${user.lastName}` : ""),
      guestEmail: initial.guestEmail ?? user?.email ?? "",
      guestPhone: initial.guestPhone ?? user?.phone ?? "",
      specialRequest: initial.specialRequest ?? "",
    },
  });

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Full name"
          autoComplete="name"
          error={errors.guestName?.message}
          {...register("guestName")}
        />
        <TextField
          label="Phone"
          type="tel"
          autoComplete="tel"
          error={errors.guestPhone?.message}
          {...register("guestPhone")}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          className="sm:col-span-2"
          error={errors.guestEmail?.message}
          {...register("guestEmail")}
        />
      </div>
      <TextAreaField
        label={specialRequestLabel}
        hint="Allergies, celebrations, accessibility needs…"
        error={errors.specialRequest?.message}
        {...register("specialRequest")}
      />
      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Review booking</Button>
      </div>
    </form>
  );
}
