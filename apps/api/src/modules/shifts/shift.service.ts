import type {
  CreateShiftInput,
  ScheduledShiftDto,
  ScheduleEntryInput,
  ShiftDto,
} from "@smartdine/shared";
import { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { formatDateOnly, parseDateOnly } from "../../utils/dates";
import { isUniqueViolation } from "../../utils/prisma";
import { getCompany } from "../settings/settings.service";

const toShiftDto = (s: ShiftDto): ShiftDto => ({
  id: s.id,
  name: s.name,
  startTime: s.startTime,
  endTime: s.endTime,
});

const toScheduledDto = (s: {
  id: string;
  userId: string;
  branchId: string;
  date: Date;
  shiftId: string | null;
  dayOff: boolean;
}): ScheduledShiftDto => ({
  id: s.id,
  userId: s.userId,
  branchId: s.branchId,
  date: formatDateOnly(s.date),
  shiftId: s.shiftId,
  dayOff: s.dayOff,
});

const MAX_RANGE_DAYS = 62;

export const shiftService = {
  async listShifts() {
    const company = await getCompany();
    const shifts = await prisma.shift.findMany({
      where: { companyId: company.id },
      orderBy: { startTime: "asc" },
    });
    return shifts.map(toShiftDto);
  },

  async createShift(input: CreateShiftInput) {
    const company = await getCompany();
    try {
      return toShiftDto(await prisma.shift.create({ data: { ...input, companyId: company.id } }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict("SHIFT_NAME_TAKEN", "A shift with this name already exists.");
      }
      throw error;
    }
  },

  async updateShift(id: string, input: Partial<CreateShiftInput>) {
    try {
      return toShiftDto(await prisma.shift.update({ where: { id }, data: input }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict("SHIFT_NAME_TAKEN", "A shift with this name already exists.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw AppError.notFound("Shift not found.");
      }
      throw error;
    }
  },

  async deleteShift(id: string) {
    const inUse = await prisma.scheduledShift.count({ where: { shiftId: id } });
    if (inUse > 0) {
      throw AppError.conflict(
        "SHIFT_IN_USE",
        "This shift is scheduled for staff and cannot be deleted.",
      );
    }
    const { count } = await prisma.shift.deleteMany({ where: { id } });
    if (count === 0) throw AppError.notFound("Shift not found.");
  },

  async listSchedule(auth: AuthContext, query: { branchId: string; from: string; to: string }) {
    assertBranchAccess(auth, query.branchId);
    const from = parseDateOnly(query.from);
    const to = parseDateOnly(query.to);
    if (to < from || (to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      throw AppError.validation(`Choose a date range of at most ${MAX_RANGE_DAYS} days.`);
    }
    const rows = await prisma.scheduledShift.findMany({
      where: { branchId: query.branchId, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
    });
    return rows.map(toScheduledDto);
  },

  /** Creates or replaces the entry for a staff member on a date. */
  async upsertEntry(auth: AuthContext, input: ScheduleEntryInput) {
    assertBranchAccess(auth, input.branchId);
    const member = await prisma.user.findFirst({
      where: {
        id: input.userId,
        deletedAt: null,
        branchId: input.branchId,
        role: { name: { not: "CUSTOMER" } },
      },
    });
    if (!member) throw AppError.validation("That staff member does not belong to this branch.");
    if (input.shiftId) {
      const shift = await prisma.shift.findUnique({ where: { id: input.shiftId } });
      if (!shift) throw AppError.validation("The selected shift does not exist.");
    }
    const date = parseDateOnly(input.date);
    const data = { branchId: input.branchId, shiftId: input.shiftId ?? null, dayOff: input.dayOff };
    const row = await prisma.scheduledShift.upsert({
      where: { userId_date: { userId: input.userId, date } },
      update: data,
      create: { userId: input.userId, date, ...data },
    });
    return toScheduledDto(row);
  },

  async deleteEntry(auth: AuthContext, id: string) {
    const entry = await prisma.scheduledShift.findUnique({ where: { id } });
    if (!entry) throw AppError.notFound("Schedule entry not found.");
    assertBranchAccess(auth, entry.branchId);
    await prisma.scheduledShift.delete({ where: { id } });
  },

  async mySchedule(userId: string, from: string, to: string) {
    const rows = await prisma.scheduledShift.findMany({
      where: { userId, date: { gte: parseDateOnly(from), lte: parseDateOnly(to) } },
      orderBy: { date: "asc" },
    });
    return rows.map(toScheduledDto);
  },
};
