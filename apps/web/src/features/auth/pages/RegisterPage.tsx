import { zodResolver } from "@hookform/resolvers/zod";
import { registerCustomerSchema, type RegisterCustomerInput } from "@smartdine/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { ApiClientError } from "@/services/api/client";
import { useAuthStore } from "@/stores/authStore";

import { authApi } from "../api/authApi";
import { AuthCard } from "../components/AuthCard";
import { FormError } from "../components/FormError";
import { postLoginPath } from "../utils/roleHome";

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterCustomerInput>({ resolver: zodResolver(registerCustomerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const session = await authApi.register(values);
      useAuthStore.getState().setSession(session);
      navigate(
        postLoginPath(session.user.role, (location.state as { from?: string } | null)?.from),
        {
          replace: true,
        },
      );
    } catch (error) {
      setServerError(error instanceof ApiClientError ? error.message : "Something went wrong.");
    }
  });

  return (
    <AuthCard
      title="Create your account"
      subtitle="Book tables and rooms, track reservations and earn rewards."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            state={location.state}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={serverError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            autoComplete="given-name"
            error={errors.firstName?.message}
            {...register("firstName")}
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            error={errors.lastName?.message}
            {...register("lastName")}
          />
        </div>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          error={errors.phone?.message}
          {...register("phone", { setValueAs: (value: string) => value || undefined })}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters with upper, lower case and a number."
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
