import { randomBytes } from "node:crypto";

import {
  ASSIGNABLE_ROLES,
  STAFF_ROLES,
  type CreateStaffInput,
  type Role,
  type UpdateStaffInput,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, scopeBranch } from "../../shared/auth/branchAccess";
import { paginationMeta } from "../../shared/http/pagination";
import type { AuthContext } from "../../types/express";
import { parseDateOnly } from "../../utils/dates";
import { isUniqueViolation } from "../../utils/prisma";
import { hashPassword } from "../auth/password";
import { staffInclude, toStaffDto, type StaffRecord } from "./staff.mapper";

const generateEmployeeId = () => `EMP-${randomBytes(3).toString("hex").toUpperCase()}`;
const date = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : parseDateOnly(value);

type ProfileInput = Pick<
  UpdateStaffInput,
  | "address"
  | "dateOfBirth"
  | "department"
  | "employmentStatus"
  | "hireDate"
  | "profileImageUrl"
  | "emergencyContactName"
  | "emergencyContactPhone"
>;

function profileData(input: ProfileInput) {
  return {
    address: input.address,
    department: input.department,
    employmentStatus: input.employmentStatus,
    profileImageUrl: input.profileImageUrl,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    dateOfBirth: date(input.dateOfBirth),
    hireDate: date(input.hireDate),
  };
}

async function loadManageable(auth: AuthContext, id: string): Promise<StaffRecord> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null, role: { name: { in: [...STAFF_ROLES] } } },
    include: staffInclude,
  });
  if (!user) throw AppError.notFound("Staff member not found.");
  if (user.branchId) assertBranchAccess(auth, user.branchId);
  else if (auth.role !== "OWNER") throw AppError.forbidden();
  // Managers may only touch the roles they are allowed to create.
  if (!ASSIGNABLE_ROLES[auth.role].includes(user.role.name as Role)) {
    throw AppError.forbidden("You cannot manage this staff member.");
  }
  return user;
}

function assertAssignable(auth: AuthContext, role: Role) {
  if (!ASSIGNABLE_ROLES[auth.role].includes(role)) {
    throw AppError.forbidden(`You are not allowed to assign the ${role} role.`);
  }
}

async function assertBranchExists(branchId: string) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
  if (!branch) throw AppError.validation("The selected branch does not exist.");
}

export const staffService = {
  async list(
    auth: AuthContext,
    query: { branchId?: string; role?: string; page: number; pageSize: number },
  ) {
    const branchId = scopeBranch(auth, query.branchId);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: {
        name: query.role ? query.role : { in: ASSIGNABLE_ROLES[auth.role].map(String) },
      },
      ...(branchId && { branchId }),
    };
    if (query.role && !ASSIGNABLE_ROLES[auth.role].includes(query.role as Role)) {
      return { staff: [], meta: paginationMeta(query.page, query.pageSize, 0) };
    }
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        include: staffInclude,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    return {
      staff: items.map(toStaffDto),
      meta: paginationMeta(query.page, query.pageSize, total),
    };
  },

  async get(auth: AuthContext, id: string) {
    return toStaffDto(await loadManageable(auth, id));
  },

  async create(auth: AuthContext, input: CreateStaffInput) {
    const role = input.role as Role;
    assertAssignable(auth, role);
    assertBranchAccess(auth, input.branchId);
    await assertBranchExists(input.branchId);
    const passwordHash = await hashPassword(input.password);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const user = await prisma.user.create({
          data: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            role: { connect: { name: role } },
            branch: { connect: { id: input.branchId } },
            staffProfile: {
              create: {
                employeeId: input.employeeId ?? generateEmployeeId(),
                ...profileData(input),
              },
            },
          },
          include: staffInclude,
        });
        void audit(auth, {
          action: "staff.created",
          entity: "staff",
          entityId: user.id,
          branchId: input.branchId,
          newValue: { email: user.email, role, branchId: input.branchId },
        });
        return toStaffDto(user);
      } catch (error) {
        if (isUniqueViolation(error, "email")) {
          throw AppError.conflict("EMAIL_TAKEN", "An account with this email already exists.");
        }
        if (isUniqueViolation(error, "employeeId")) {
          if (input.employeeId) {
            throw AppError.conflict("EMPLOYEE_ID_TAKEN", "This employee ID is already in use.");
          }
          continue; // randomly generated ID collided; retry with a new one
        }
        throw error;
      }
    }
    throw AppError.conflict("EMPLOYEE_ID_TAKEN", "Could not allocate an employee ID.");
  },

  async update(auth: AuthContext, id: string, input: UpdateStaffInput) {
    const existing = await loadManageable(auth, id);
    if (input.role) assertAssignable(auth, input.role as Role);
    if (input.branchId) {
      assertBranchAccess(auth, input.branchId);
      await assertBranchExists(input.branchId);
    }
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    try {
      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            passwordHash,
            ...(input.branchId && { branch: { connect: { id: input.branchId } } }),
            ...(input.role && { role: { connect: { name: input.role } } }),
            staffProfile: {
              upsert: {
                update: {
                  ...profileData(input),
                  ...(input.employeeId && { employeeId: input.employeeId }),
                },
                create: {
                  employeeId: input.employeeId ?? generateEmployeeId(),
                  ...profileData(input),
                },
              },
            },
          },
          include: staffInclude,
        });
        // Credentials, role or branch changes invalidate existing sessions.
        if (
          passwordHash ||
          input.role ||
          (input.branchId && input.branchId !== existing.branchId)
        ) {
          await tx.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        // A waiter moved to another branch / role stops owning tables in the old one.
        if ((input.branchId && input.branchId !== existing.branchId) || input.role) {
          await tx.restaurantTable.updateMany({
            where: { assignedWaiterId: id },
            data: { assignedWaiterId: null },
          });
        }
        return updated;
      });
      void audit(auth, {
        action: "staff.updated",
        entity: "staff",
        entityId: id,
        branchId: user.branchId,
        previousValue: { role: existing.role.name, branchId: existing.branchId },
        newValue: {
          role: input.role ?? existing.role.name,
          branchId: input.branchId ?? existing.branchId,
          // Never the password itself, only the fact it was reset.
          ...(passwordHash && { passwordReset: true }),
        },
      });
      return toStaffDto(user);
    } catch (error) {
      if (isUniqueViolation(error, "employeeId")) {
        throw AppError.conflict("EMPLOYEE_ID_TAKEN", "This employee ID is already in use.");
      }
      throw error;
    }
  },

  /** Soft delete: the account is disabled, sessions revoked and table assignments cleared. */
  async remove(auth: AuthContext, id: string) {
    if (auth.userId === id) throw AppError.validation("You cannot remove your own account.");
    const target = await loadManageable(auth, id);
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: "DISABLED" },
      }),
      prisma.staffProfile.updateMany({
        where: { userId: id },
        data: { employmentStatus: "TERMINATED" },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.restaurantTable.updateMany({
        where: { assignedWaiterId: id },
        data: { assignedWaiterId: null },
      }),
    ]);
    void audit(auth, {
      action: "staff.deleted",
      entity: "staff",
      entityId: id,
      branchId: target.branchId,
      previousValue: { email: target.email, role: target.role.name },
    });
  },
};
