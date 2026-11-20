import { zodResolver } from "@hookform/resolvers/zod";
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from "@smartdine/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { authApi } from "@/features/auth/api/authApi";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiClientError } from "@/services/api/client";
import { useAuthStore } from "@/stores/authStore";

const messageOf = (error: unknown) =>
  error instanceof ApiClientError ? error.message : "Something went wrong.";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ProfileDetailsForm() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: user?.firstName,
      lastName: user?.lastName,
      phone: user?.phone ?? undefined,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      useAuthStore
        .getState()
        .setUser(await authApi.updateProfile({ ...values, phone: values.phone || null }));
      setSaved(true);
    } catch (e) {
      setError(messageOf(e));
    }
  });

  return (
    <Section title="Personal details">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            error={errors.firstName?.message}
            {...register("firstName")}
          />
          <TextField label="Last name" error={errors.lastName?.message} {...register("lastName")} />
        </div>
        <TextField label="Email" value={user?.email ?? ""} disabled readOnly />
        <TextField label="Phone" type="tel" error={errors.phone?.message} {...register("phone")} />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
          {saved && (
            <span role="status" className="text-sm text-success">
              Saved
            </span>
          )}
        </div>
      </form>
    </Section>
  );
}

function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      // The API signs out every other device and returns a fresh session for this one.
      useAuthStore.getState().setSession(await authApi.changePassword(values));
      reset();
      setSaved(true);
    } catch (e) {
      setError(messageOf(e));
    }
  });

  return (
    <Section title="Change password">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="Changing your password signs you out of all other devices."
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating…" : "Update password"}
          </Button>
          {saved && (
            <span role="status" className="text-sm text-success">
              Password updated
            </span>
          )}
        </div>
      </form>
    </Section>
  );
}

export function ProfileForms() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ProfileDetailsForm />
      <ChangePasswordForm />
    </div>
  );
}
