import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@smartdine/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { ApiClientError } from "@/services/api/client";
import { useAuthStore } from "@/stores/authStore";

import { authApi } from "../api/authApi";
import { AuthCard } from "../components/AuthCard";
import { DemoRoleButtons } from "../components/DemoRoleButtons";
import { FormError } from "../components/FormError";
import { postLoginPath } from "../utils/roleHome";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const session = await authApi.login(values);
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
      title="Welcome back"
      subtitle="Sign in to manage reservations, bookings and more."
      footer={
        <>
          New to SmartDine?{" "}
          <Link
            to="/register"
            state={location.state}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={serverError} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <DemoRoleButtons
        disabled={isSubmitting}
        onPick={(email, password) => {
          setValue("email", email);
          setValue("password", password);
          void onSubmit();
        }}
      />
    </AuthCard>
  );
}
