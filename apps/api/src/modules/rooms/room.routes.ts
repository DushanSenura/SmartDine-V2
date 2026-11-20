import {
  createExtraSchema,
  createRoomSchema,
  createRoomTypeSchema,
  Permissions,
  roomListQuerySchema,
  setRoomStatusSchema,
  updateExtraSchema,
  updateRoomSchema,
  updateRoomTypeSchema,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize";
import { publicRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { roomService } from "./room.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const branchOf = (req: { query: unknown }) => (req.query as { branchId?: string }).branchId;
const publicQuery = z.object({ branchId: z.uuid() });
const manage = requirePermission(Permissions.ROOMS_MANAGE);

// ── /room-types ──────────────────────────────────────────────────
export const roomTypeRouter: Router = Router();

roomTypeRouter.get(
  "/",
  publicRateLimiter,
  validate("query", publicQuery),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.publicRoomTypes(branchOf(req)!)),
  ),
);
roomTypeRouter.get(
  "/by-slug/:slug",
  publicRateLimiter,
  validate("query", publicQuery),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.publicRoomType(branchOf(req)!, String(req.params.slug))),
  ),
);
roomTypeRouter.get(
  "/admin",
  authenticate,
  manage,
  validate("query", roomListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.adminRoomTypes(req.auth!, branchOf(req))),
  ),
);
roomTypeRouter.post(
  "/",
  authenticate,
  manage,
  validate("body", createRoomTypeSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.createRoomType(req.auth!, req.body), { status: 201 }),
  ),
);
roomTypeRouter.patch(
  "/:id",
  authenticate,
  manage,
  validate("body", updateRoomTypeSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.updateRoomType(req.auth!, idParam(req), req.body)),
  ),
);
roomTypeRouter.delete(
  "/:id",
  authenticate,
  manage,
  asyncHandler(async (req, res) => {
    await roomService.deleteRoomType(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);

// ── /rooms ───────────────────────────────────────────────────────
export const roomRouter: Router = Router();
roomRouter.use(authenticate);

// Housekeeping staff need to see the inventory to do their job.
const viewRooms = requireAnyPermission(Permissions.ROOMS_MANAGE, Permissions.HOUSEKEEPING_UPDATE);

roomRouter.get(
  "/",
  viewRooms,
  validate("query", roomListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.listRooms(req.auth!, branchOf(req))),
  ),
);
roomRouter.get(
  "/overview",
  manage,
  validate("query", roomListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.overview(req.auth!, branchOf(req))),
  ),
);
roomRouter.post(
  "/",
  manage,
  validate("body", createRoomSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.createRoom(req.auth!, req.body), { status: 201 }),
  ),
);
roomRouter.patch(
  "/:id",
  manage,
  validate("body", updateRoomSchema),
  asyncHandler(async (req, res) => {
    await roomService.updateRoom(req.auth!, idParam(req), req.body);
    sendSuccess(res, null);
  }),
);
roomRouter.patch(
  "/:id/status",
  manage,
  validate("body", setRoomStatusSchema),
  asyncHandler(async (req, res) => {
    await roomService.setStatus(req.auth!, idParam(req), (req.body as { status: never }).status);
    sendSuccess(res, null);
  }),
);
roomRouter.delete(
  "/:id",
  manage,
  asyncHandler(async (req, res) => {
    await roomService.deleteRoom(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);

// ── /room-extras ─────────────────────────────────────────────────
export const extraRouter: Router = Router();

extraRouter.get(
  "/",
  publicRateLimiter,
  validate("query", publicQuery),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.publicExtras(branchOf(req)!)),
  ),
);
extraRouter.get(
  "/admin",
  authenticate,
  manage,
  validate("query", roomListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.adminExtras(req.auth!, branchOf(req))),
  ),
);
extraRouter.post(
  "/",
  authenticate,
  manage,
  validate("body", createExtraSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.createExtra(req.auth!, req.body), { status: 201 }),
  ),
);
extraRouter.patch(
  "/:id",
  authenticate,
  manage,
  validate("body", updateExtraSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await roomService.updateExtra(req.auth!, idParam(req), req.body)),
  ),
);
extraRouter.delete(
  "/:id",
  authenticate,
  manage,
  asyncHandler(async (req, res) => {
    await roomService.deleteExtra(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
