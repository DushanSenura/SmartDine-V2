import { Permissions, promotionSchema, updatePromotionSchema } from "@smartdine/shared";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { promotionService } from "./promotion.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);

export const promotionRouter: Router = Router();
promotionRouter.use(authenticate, requirePermission(Permissions.PROMOTIONS_MANAGE));

promotionRouter.get(
  "/",
  asyncHandler(async (req, res) => sendSuccess(res, await promotionService.list(req.auth!))),
);
promotionRouter.post(
  "/",
  validate("body", promotionSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await promotionService.create(req.auth!, req.body), { status: 201 }),
  ),
);
promotionRouter.patch(
  "/:id",
  validate("body", updatePromotionSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await promotionService.update(req.auth!, idParam(req), req.body)),
  ),
);
promotionRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await promotionService.remove(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
