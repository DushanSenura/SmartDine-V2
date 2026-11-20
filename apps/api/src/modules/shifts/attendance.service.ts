import type { AttendanceDto } from "@smartdine/shared";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { parseDateOnly } from "../../utils/dates";

const toDto = (row: {
  id: string;
  userId: string;
  branchId: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  user: { firstName: string; lastName: string };
}): AttendanceDto => ({
  id: row.id,
  userId: row.userId,
  userName: `${row.user.firstName} ${row.user.lastName}`,
  branchId: row.branchId,
  clockInAt: row.clockInAt.toISOString(),
  clockOutAt: row.clockOutAt?.toISOString() ?? null,
});

const withUser = { user: { select: { firstName: true, lastName: true } } } as const;

export const attendanceService = {
  async current(userId: string) {
    const open = await prisma.attendance.findFirst({
      where: { userId, clockOutAt: null },
      include: withUser,
    });
    return open ? toDto(open) : null;
  },

  async clockIn(auth: AuthContext) {
    if (!auth.branchId) throw AppError.validation("Your account is not assigned to a branch.");
    if (await this.current(auth.userId)) {
      throw AppError.conflict("ALREADY_CLOCKED_IN", "You are already clocked in.");
    }
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const scheduled = await prisma.scheduledShift.findUnique({
      where: { userId_date: { userId: auth.userId, date: today } },
    });
    const row = await prisma.attendance.create({
      data: {
        userId: auth.userId,
        branchId: auth.branchId,
        scheduledShiftId: scheduled && !scheduled.dayOff ? scheduled.id : null,
      },
      include: withUser,
    });
    return toDto(row);
  },

  async clockOut(auth: AuthContext) {
    const open = await prisma.attendance.findFirst({
      where: { userId: auth.userId, clockOutAt: null },
    });
    if (!open) throw AppError.conflict("NOT_CLOCKED_IN", "You are not clocked in.");
    const row = await prisma.attendance.update({
      where: { id: open.id },
      data: { clockOutAt: new Date() },
      include: withUser,
    });
    return toDto(row);
  },

  async listForDay(auth: AuthContext, branchId: string, date: string) {
    assertBranchAccess(auth, branchId);
    const start = parseDateOnly(date);
    const end = new Date(start.getTime() + 86_400_000);
    const rows = await prisma.attendance.findMany({
      where: { branchId, clockInAt: { gte: start, lt: end } },
      include: withUser,
      orderBy: { clockInAt: "asc" },
    });
    return rows.map(toDto);
  },
};
