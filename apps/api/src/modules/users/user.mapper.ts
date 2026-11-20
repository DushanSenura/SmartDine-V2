import { ROLE_PERMISSIONS, type AuthUser, type Role } from "@smartdine/shared";

import type { UserWithRole } from "./user.repository";

/** Public representation of a user. Never includes the password hash. */
export function toAuthUser(user: UserWithRole): AuthUser {
  const role = user.role.name as Role;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role,
    permissions: [...ROLE_PERMISSIONS[role]],
    branchId: user.branchId,
  };
}
