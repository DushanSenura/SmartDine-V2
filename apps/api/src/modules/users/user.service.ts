import {
  ASSIGNABLE_ROLES,
  roleHasPermission,
  Permissions,
  type ChangePasswordInput,
  type CreateStaffUserInput,
  type Role,
  type UpdateProfileInput,
} from "@smartdine/shared";
import { Prisma } from "@prisma/client";

import { AppError } from "../../shared/errors/AppError";
import { hashPassword, verifyPassword } from "../auth/password";
import { authService, type ClientInfo } from "../auth/auth.service";
import { toAuthUser } from "./user.mapper";
import { userRepository } from "./user.repository";

export const userService = {
  async updateProfile(userId: string, input: UpdateProfileInput) {
    return toAuthUser(await userRepository.update(userId, input));
  },

  async changePassword(userId: string, input: ChangePasswordInput, client: ClientInfo) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.unauthenticated();
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new AppError(400, "INVALID_CURRENT_PASSWORD", "Your current password is incorrect.");
    }
    const updated = await userRepository.update(userId, {
      passwordHash: await hashPassword(input.newPassword),
    });
    // All other devices are signed out; this device continues with a fresh session.
    return authService.resetSessions(updated, client);
  },

  async createStaff(actorRole: Role, input: CreateStaffUserInput) {
    const requested = input.role as Role;
    if (!ASSIGNABLE_ROLES[actorRole].includes(requested)) {
      throw AppError.forbidden(`You are not allowed to create ${requested} accounts.`);
    }
    try {
      const user = await userRepository.create({
        email: input.email,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        branchId: input.branchId,
        roleName: requested,
      });
      return toAuthUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw AppError.conflict("EMAIL_TAKEN", "An account with this email already exists.");
        }
        if (error.code === "P2003")
          throw AppError.validation("The selected branch does not exist.");
      }
      throw error;
    }
  },

  async list(actorRole: Role, page: number, pageSize: number) {
    // Managers only see the staff roles they are allowed to manage; owners see everyone.
    const roleNames = roleHasPermission(actorRole, Permissions.USERS_MANAGE)
      ? undefined
      : [...ASSIGNABLE_ROLES[actorRole]];
    const { items, total } = await userRepository.list({
      skip: (page - 1) * pageSize,
      take: pageSize,
      roleNames,
    });
    return {
      users: items.map(toAuthUser),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  },
};
