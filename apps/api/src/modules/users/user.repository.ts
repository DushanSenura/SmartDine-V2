import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";

export type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

const withRole = { role: true } satisfies Prisma.UserInclude;

export const userRepository = {
  findByEmail: (email: string) =>
    prisma.user.findFirst({ where: { email, deletedAt: null }, include: withRole }),

  findById: (id: string) =>
    prisma.user.findFirst({ where: { id, deletedAt: null }, include: withRole }),

  create: (data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
    roleName: string;
    branchId?: string;
  }) =>
    prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        branch: data.branchId ? { connect: { id: data.branchId } } : undefined,
        role: { connect: { name: data.roleName } },
      },
      include: withRole,
    }),

  update: (id: string, data: Prisma.UserUpdateInput) =>
    prisma.user.update({ where: { id }, data, include: withRole }),

  async list(params: { skip: number; take: number; roleNames?: string[] }) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(params.roleNames && { role: { name: { in: params.roleNames } } }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        include: withRole,
        orderBy: { createdAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  },
};
