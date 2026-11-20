import { notificationListQuerySchema } from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { notificationService } from "./notification.service";

const idParam = z.object({ id: z.uuid() });

/** Everyone, staff and customers alike, has their own notifications. */
export const notificationRouter: Router = Router();
notificationRouter.use(authenticate);

notificationRouter.get(
  "/",
  validate("query", notificationListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await notificationService.list(
        req.auth!,
        req.query as unknown as z.infer<typeof notificationListQuerySchema>,
      ),
    ),
  ),
);
notificationRouter.post(
  "/read-all",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await notificationService.markAllRead(req.auth!)),
  ),
);
notificationRouter.post(
  "/:id/read",
  validate("params", idParam),
  asyncHandler(async (req, res) => {
    await notificationService.markRead(req.auth!, String(req.params.id));
    sendSuccess(res, null);
  }),
);
