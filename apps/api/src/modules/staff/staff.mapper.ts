import type { StaffDto } from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { formatDateOnly } from "../../utils/dates";

export const staffInclude = { role: true, staffProfile: true } satisfies Prisma.UserInclude;
export type StaffRecord = Prisma.UserGetPayload<{ include: typeof staffInclude }>;

export function toStaffDto(user: StaffRecord): StaffDto {
  const profile = user.staffProfile;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role.name,
    branchId: user.branchId,
    status: user.status,
    employeeId: profile?.employeeId ?? null,
    address: profile?.address ?? null,
    dateOfBirth: profile?.dateOfBirth ? formatDateOnly(profile.dateOfBirth) : null,
    department: profile?.department ?? null,
    employmentStatus: profile?.employmentStatus ?? null,
    hireDate: profile?.hireDate ? formatDateOnly(profile.hireDate) : null,
    profileImageUrl: profile?.profileImageUrl ?? null,
    emergencyContactName: profile?.emergencyContactName ?? null,
    emergencyContactPhone: profile?.emergencyContactPhone ?? null,
  };
}
