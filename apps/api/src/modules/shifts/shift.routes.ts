import {
  attendanceQuerySchema,
  createShiftSchema,
  Permissions,
  scheduleEntrySchema,
  scheduleQuerySchema,
  STAFF_ROLES,
  updateShiftSchema,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireRole } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { attendanceService } from "./attendance.service";
import { shiftService } from "./shift.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const rangeSchema = z.object({
  from: scheduleQuerySchema.shape.from,
  to: scheduleQuerySchema.shape.to,
});

export const shiftRouter: Router = Router();

shiftRouter.use(authenticate);

const manage = requirePermission(Permissions.STAFF_MANAGE);
const anyStaff = requireRole(...STAFF_ROLES);

// ── Self-service (any staff member) ──────────────────────────────
shiftRouter.get(
  "/schedule/me",
  anyStaff,
  validate("query", rangeSchema),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as unknown as z.infer<typeof rangeSchema>;
    sendSuccess(res, await shiftService.mySchedule(req.auth!.userId, from, to));
  }),
);
shiftRouter.get(
  "/attendance/me",
  anyStaff,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await attendanceService.current(req.auth!.userId)),
  ),
);
shiftRouter.post(
  "/attendance/clock-in",
  anyStaff,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await attendanceService.clockIn(req.auth!), { status: 201 }),
  ),
);
shiftRouter.post(
  "/attendance/clock-out",
  anyStaff,
  asyncHandler(async (req, res) => sendSuccess(res, await attendanceService.clockOut(req.auth!))),
);

// ── Management ───────────────────────────────────────────────────
shiftRouter.get(
  "/attendance",
  manage,
  validate("query", attendanceQuerySchema),
  asyncHandler(async (req, res) => {
    const { branchId, date } = req.query as unknown as z.infer<typeof attendanceQuerySchema>;
    sendSuccess(res, await attendanceService.listForDay(req.auth!, branchId, date));
  }),
);
shiftRouter.get(
  "/schedule",
  manage,
  validate("query", scheduleQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof scheduleQuerySchema>;
    sendSuccess(res, await shiftService.listSchedule(req.auth!, query));
  }),
);
shiftRouter.put(
  "/schedule",
  manage,
  validate("body", scheduleEntrySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await shiftService.upsertEntry(req.auth!, req.body)),
  ),
);
shiftRouter.delete(
  "/schedule/:id",
  manage,
  asyncHandler(async (req, res) => {
    await shiftService.deleteEntry(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);

shiftRouter.get(
  "/",
  manage,
  asyncHandler(async (_req, res) => sendSuccess(res, await shiftService.listShifts())),
);
shiftRouter.post(
  "/",
  manage,
  validate("body", createShiftSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await shiftService.createShift(req.body), { status: 201 }),
  ),
);
shiftRouter.patch(
  "/:id",
  manage,
  validate("body", updateShiftSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await shiftService.updateShift(idParam(req), req.body)),
  ),
);
shiftRouter.delete(
  "/:id",
  manage,
  asyncHandler(async (req, res) => {
    await shiftService.deleteShift(idParam(req));
    sendSuccess(res, null);
  }),
);
