import {
  branchQuerySchema,
  createPrivateRoomSchema,
  Permissions,
  updatePrivateRoomSchema,
} from "@smartdine/shared";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { privateDiningService } from "./private-dining.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);

export const privateDiningRouter: Router = Router();

privateDiningRouter.use(authenticate);

privateDiningRouter.get(
  "/",
  requirePermission(Permissions.TABLES_VIEW),
  validate("query", branchQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await privateDiningService.list(req.auth!, (req.query as { branchId?: string }).branchId),
    ),
  ),
);

const manage = requirePermission(Permissions.TABLES_MANAGE);
privateDiningRouter.post(
  "/",
  manage,
  validate("body", createPrivateRoomSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await privateDiningService.create(req.auth!, req.body), { status: 201 }),
  ),
);
privateDiningRouter.patch(
  "/:id",
  manage,
  validate("body", updatePrivateRoomSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await privateDiningService.update(req.auth!, idParam(req), req.body)),
  ),
);
privateDiningRouter.delete(
  "/:id",
  manage,
  asyncHandler(async (req, res) => {
    await privateDiningService.remove(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
