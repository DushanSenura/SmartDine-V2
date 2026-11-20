import {
  housekeepingUpdateSchema,
  Permissions,
  taskListQuerySchema,
  taskUpdateSchema,
} from "@smartdine/shared";
import { Router } from "express";
import { type z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requireAnyPermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { housekeepingService } from "./housekeeping.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);

export const housekeepingRouter: Router = Router();

// Managers and the floor staff who clean rooms.
housekeepingRouter.use(
  authenticate,
  requireAnyPermission(Permissions.HOUSEKEEPING_UPDATE, Permissions.ROOMS_MANAGE),
);

housekeepingRouter.get(
  "/tasks",
  validate("query", taskListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await housekeepingService.listTasks(
        req.auth!,
        req.query as z.infer<typeof taskListQuerySchema>,
      ),
    ),
  ),
);
housekeepingRouter.patch(
  "/tasks/:id",
  validate("body", taskUpdateSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await housekeepingService.updateTask(req.auth!, idParam(req), req.body)),
  ),
);
housekeepingRouter.patch(
  "/rooms/:id",
  validate("body", housekeepingUpdateSchema),
  asyncHandler(async (req, res) => {
    const { housekeepingStatus, notes } = req.body as z.infer<typeof housekeepingUpdateSchema>;
    await housekeepingService.setRoomStatus(req.auth!, idParam(req), housekeepingStatus, notes);
    sendSuccess(res, null);
  }),
);
