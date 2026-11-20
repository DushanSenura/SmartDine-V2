import type {
  AuthSession,
  ChangePasswordInput,
  LoginInput,
  RegisterCustomerInput,
  UpdateProfileInput,
  AuthUser,
} from "@smartdine/shared";

import { apiRequest } from "@/services/api/client";

export const authApi = {
  login: (input: LoginInput) =>
    apiRequest<AuthSession>("/auth/login", { method: "POST", body: input, anonymous: true }),
  register: (input: RegisterCustomerInput) =>
    apiRequest<AuthSession>("/auth/register", { method: "POST", body: input, anonymous: true }),
  logout: () => apiRequest<null>("/auth/logout", { method: "POST", anonymous: true }),
  updateProfile: (input: UpdateProfileInput) =>
    apiRequest<AuthUser>("/users/me", { method: "PATCH", body: input }),
  changePassword: (input: ChangePasswordInput) =>
    apiRequest<AuthSession>("/users/me/password", { method: "POST", body: input }),
};
