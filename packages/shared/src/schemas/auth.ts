import { z } from "zod";

import { ROLE_VALUES, STAFF_ROLES } from "../constants/rbac";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number");

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));
const nameSchema = z.string().trim().min(1, "Required").max(80);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});

export const registerCustomerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
});

export const createStaffUserSchema = registerCustomerSchema.extend({
  role: z.enum(STAFF_ROLES as [string, ...string[]]),
  branchId: z.uuid().optional(),
});

export const updateProfileSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema.nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The authenticated user as returned by the API. */
export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  role: z.enum(ROLE_VALUES),
  permissions: z.array(z.string()),
  branchId: z.string().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}
