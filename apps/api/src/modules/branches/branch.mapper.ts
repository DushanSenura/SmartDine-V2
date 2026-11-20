import type { BranchDto, OpeningHours } from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { toNumber } from "../../utils/prisma";

export const branchInclude = {
  manager: { select: { firstName: true, lastName: true } },
} satisfies Prisma.BranchInclude;

export type BranchWithManager = Prisma.BranchGetPayload<{ include: typeof branchInclude }>;

export function toBranchDto(branch: BranchWithManager): BranchDto {
  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    status: branch.status,
    address: branch.address,
    city: branch.city,
    phone: branch.phone,
    email: branch.email,
    timezone: branch.timezone,
    currency: branch.currency,
    openingHours: branch.openingHours as OpeningHours | null,
    latitude: toNumber(branch.latitude),
    longitude: toNumber(branch.longitude),
    managerId: branch.managerId,
    managerName: branch.manager ? `${branch.manager.firstName} ${branch.manager.lastName}` : null,
  };
}
