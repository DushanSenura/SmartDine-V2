import type { CreateBranchInput, UpdateBranchInput } from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { isUniqueViolation, jsonOrNull } from "../../utils/prisma";
import { getCompany } from "../settings/settings.service";
import { branchInclude, toBranchDto } from "./branch.mapper";

async function assertValidManager(managerId: string) {
  const user = await prisma.user.findFirst({
    where: { id: managerId, deletedAt: null, status: "ACTIVE", role: { name: "MANAGER" } },
  });
  if (!user) throw AppError.validation("The selected manager does not exist or is not a Manager.");
}

function toData(input: UpdateBranchInput): Prisma.BranchUncheckedUpdateInput {
  const { openingHours, managerId, ...rest } = input;
  return {
    ...rest,
    ...(managerId !== undefined && { managerId }),
    ...(openingHours !== undefined && { openingHours: jsonOrNull(openingHours) }),
  };
}

export const branchService = {
  async list(auth: AuthContext) {
    const where: Prisma.BranchWhereInput = {
      deletedAt: null,
      ...(auth.role !== "OWNER" && { id: auth.branchId ?? "none" }),
    };
    const branches = await prisma.branch.findMany({
      where,
      include: branchInclude,
      orderBy: { name: "asc" },
    });
    return branches.map(toBranchDto);
  },

  async get(auth: AuthContext, id: string) {
    assertBranchAccess(auth, id);
    const branch = await prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: branchInclude,
    });
    if (!branch) throw AppError.notFound("Branch not found.");
    return toBranchDto(branch);
  },

  async create(input: CreateBranchInput, actor?: AuthContext) {
    const company = await getCompany();
    if (input.managerId) await assertValidManager(input.managerId);
    try {
      const branch = await prisma.$transaction(async (tx) => {
        const created = await tx.branch.create({
          data: {
            ...(toData(input) as Prisma.BranchUncheckedCreateInput),
            companyId: company.id,
            name: input.name,
            code: input.code,
            timezone: input.timezone ?? company.timezone,
            currency: input.currency ?? company.currency,
          },
          include: branchInclude,
        });
        // A branch manager belongs to the branch they manage (this drives data scoping).
        if (input.managerId) {
          await tx.user.update({ where: { id: input.managerId }, data: { branchId: created.id } });
        }
        return created;
      });
      void audit(actor ?? null, {
        action: "branch.created",
        entity: "branch",
        entityId: branch.id,
        branchId: branch.id,
        newValue: { name: branch.name, code: branch.code },
      });
      return toBranchDto(branch);
    } catch (error) {
      if (isUniqueViolation(error, "code")) {
        throw AppError.conflict("BRANCH_CODE_TAKEN", "A branch with this code already exists.");
      }
      throw error;
    }
  },

  async update(id: string, input: UpdateBranchInput, actor?: AuthContext) {
    const existing = await prisma.branch.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Branch not found.");
    if (input.managerId) await assertValidManager(input.managerId);

    try {
      const branch = await prisma.$transaction(async (tx) => {
        const updated = await tx.branch.update({
          where: { id },
          data: toData(input),
          include: branchInclude,
        });
        if (input.managerId !== undefined && input.managerId !== existing.managerId) {
          if (existing.managerId) {
            // The previous manager loses branch-scoped access.
            await tx.user.updateMany({
              where: { id: existing.managerId, branchId: id },
              data: { branchId: null },
            });
          }
          if (input.managerId) {
            await tx.user.update({ where: { id: input.managerId }, data: { branchId: id } });
          }
        }
        return updated;
      });
      void audit(actor ?? null, {
        action: "branch.updated",
        entity: "branch",
        entityId: id,
        branchId: id,
        previousValue: {
          name: existing.name,
          status: existing.status,
          managerId: existing.managerId,
        },
        newValue: { name: branch.name, status: branch.status, managerId: branch.managerId },
      });
      return toBranchDto(branch);
    } catch (error) {
      if (isUniqueViolation(error, "code")) {
        throw AppError.conflict("BRANCH_CODE_TAKEN", "A branch with this code already exists.");
      }
      throw error;
    }
  },

  async remove(id: string, actor?: AuthContext) {
    const { count } = await prisma.branch.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), status: "CLOSED" },
    });
    if (count === 0) throw AppError.notFound("Branch not found.");
    void audit(actor ?? null, {
      action: "branch.deleted",
      entity: "branch",
      entityId: id,
      branchId: id,
    });
  },
};
