import {
  createServiceRequestSchema,
  Permissions,
  serviceRequestListQuerySchema,
  type ServiceRequestListQuery,
} from "@smartdine/shared";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { serviceRequestService } from "./service-request.service";

export const serviceRequestRouter: Router = Router();
// The people who serve the floor: waiters and managers (and owners).
serviceRequestRouter.use(authenticate, requirePermission(Permissions.ORDERS_SERVE));

serviceRequestRouter.get(
  "/",
  validate("query", serviceRequestListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await serviceRequestService.list(req.auth!, req.query as unknown as ServiceRequestListQuery),
    ),
  ),
);
serviceRequestRouter.post(
  "/",
  validate("body", createServiceRequestSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await serviceRequestService.create(req.auth!, req.body), { status: 201 }),
  ),
);
serviceRequestRouter.post(
  "/:id/resolve",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await serviceRequestService.resolve(req.auth!, String(req.params.id))),
  ),
);
