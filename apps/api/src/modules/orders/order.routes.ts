import {
  addItemsSchema,
  createOrderSchema,
  orderListQuerySchema,
  Permissions,
  reasonSchema,
  updateItemSchema,
  updateOrderSchema,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { orderService } from "./order.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const itemParam = (req: { params: Record<string, unknown> }) => String(req.params.itemId);
const serveSchema = z.object({ itemIds: z.array(z.uuid()).min(1).max(100).optional() });

export const orderRouter: Router = Router();
orderRouter.use(authenticate);

const view = requirePermission(Permissions.ORDERS_VIEW);
const create = requirePermission(Permissions.ORDERS_CREATE);
const approve = requirePermission(Permissions.ORDERS_APPROVE);
const serve = requirePermission(Permissions.ORDERS_SERVE);

orderRouter.get(
  "/",
  view,
  validate("query", orderListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await orderService.list(
        req.auth!,
        req.query as unknown as z.infer<typeof orderListQuerySchema>,
      ),
    ),
  ),
);
orderRouter.post(
  "/",
  create,
  validate("body", createOrderSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await orderService.create(req.auth!, req.body), { status: 201 }),
  ),
);
orderRouter.get(
  "/:id",
  view,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await orderService.get(req.auth!, idParam(req))),
  ),
);
orderRouter.patch(
  "/:id",
  create,
  validate("body", updateOrderSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await orderService.update(req.auth!, idParam(req), req.body)),
  ),
);

// ── Items ────────────────────────────────────────────────────────
orderRouter.post(
  "/:id/items",
  create,
  validate("body", addItemsSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await orderService.addItems(req.auth!, idParam(req), req.body.items), {
      status: 201,
    }),
  ),
);
orderRouter.patch(
  "/:id/items/:itemId",
  create,
  validate("body", updateItemSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await orderService.updateDraftItem(req.auth!, idParam(req), itemParam(req), req.body),
    ),
  ),
);
orderRouter.post(
  "/:id/items/:itemId/cancel",
  create,
  validate("body", reasonSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await orderService.cancelItem(
        req.auth!,
        idParam(req),
        itemParam(req),
        (req.body as { reason?: string | null }).reason,
      ),
    ),
  ),
);
orderRouter.post(
  "/:id/serve",
  serve,
  validate("body", serveSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await orderService.serveItems(
        req.auth!,
        idParam(req),
        (req.body as { itemIds?: string[] }).itemIds,
      ),
    ),
  ),
);

// ── Workflow ─────────────────────────────────────────────────────
orderRouter.post(
  "/:id/submit",
  create,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await orderService.submit(req.auth!, idParam(req))),
  ),
);
orderRouter.post(
  "/:id/approve",
  approve,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await orderService.approve(req.auth!, idParam(req))),
  ),
);
orderRouter.post(
  "/:id/reject",
  approve,
  validate("body", reasonSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await orderService.reject(
        req.auth!,
        idParam(req),
        (req.body as { reason?: string | null }).reason,
      ),
    ),
  ),
);
orderRouter.post(
  "/:id/cancel",
  create,
  validate("body", reasonSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await orderService.cancel(
        req.auth!,
        idParam(req),
        (req.body as { reason?: string | null }).reason,
      ),
    ),
  ),
);
orderRouter.post(
  "/:id/request-payment",
  serve,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await orderService.requestPayment(req.auth!, idParam(req))),
  ),
);
