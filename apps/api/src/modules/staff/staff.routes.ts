import {
  createStaffSchema,
  paginationQuerySchema,
  Permissions,
  ROLE_VALUES,
  updateStaffSchema,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { staffService } from "./staff.service";

const listQuerySchema = paginationQuerySchema.extend({
  branchId: z.uuid().optional(),
  role: z.enum(ROLE_VALUES).optional(),
});

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);

export const staffRouter: Router = Router();

staffRouter.use(authenticate, requirePermission(Permissions.STAFF_MANAGE));

staffRouter.get(
  "/",
  validate("query", listQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const { staff, meta } = await staffService.list(req.auth!, query);
    sendSuccess(res, staff, { meta });
  }),
);
staffRouter.post(
  "/",
  validate("body", createStaffSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await staffService.create(req.auth!, req.body), { status: 201 }),
  ),
);
staffRouter.get(
  "/:id",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await staffService.get(req.auth!, idParam(req))),
  ),
);
staffRouter.patch(
  "/:id",
  validate("body", updateStaffSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await staffService.update(req.auth!, idParam(req), req.body)),
  ),
);
staffRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await staffService.remove(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
