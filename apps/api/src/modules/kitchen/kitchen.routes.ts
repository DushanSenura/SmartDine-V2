import {
  KITCHEN_STATIONS,
  kitchenItemStatusSchema,
  kitchenQuerySchema,
  Permissions,
  type KitchenStation,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { kitchenService } from "./kitchen.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);

export const kitchenRouter: Router = Router();
kitchenRouter.use(authenticate, requirePermission(Permissions.KITCHEN_OPERATE));

kitchenRouter.get(
  "/tickets",
  validate("query", kitchenQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await kitchenService.tickets(
        req.auth!,
        req.query as { branchId?: string; station?: KitchenStation },
      ),
    ),
  ),
);
kitchenRouter.patch(
  "/items/:id/status",
  validate("body", kitchenItemStatusSchema),
  asyncHandler(async (req, res) => {
    await kitchenService.setItemStatus(
      req.auth!,
      idParam(req),
      (req.body as { status: "PREPARING" | "PREPARED" }).status,
    );
    sendSuccess(res, null);
  }),
);
kitchenRouter.post(
  "/orders/:id/ready",
  validate("body", z.object({ station: z.enum(KITCHEN_STATIONS).optional() })),
  asyncHandler(async (req, res) => {
    await kitchenService.markReady(
      req.auth!,
      idParam(req),
      (req.body as { station?: KitchenStation }).station,
    );
    sendSuccess(res, null);
  }),
);
