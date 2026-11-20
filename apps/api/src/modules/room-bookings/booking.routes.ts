import {
  assignRoomSchema,
  createRoomBookingSchema,
  createStaffRoomBookingSchema,
  Permissions,
  roomAvailabilityQuerySchema,
  roomBookingListQuerySchema,
  updateRoomBookingStatusSchema,
  type RoomAvailabilityQuery,
} from "@smartdine/shared";
import { Router } from "express";
import { type z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireRole } from "../../middleware/authorize";
import { bookingRateLimiter, publicRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { bookingService } from "./booking.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);

export const roomBookingRouter: Router = Router();

// ── Public ───────────────────────────────────────────────────────
roomBookingRouter.get(
  "/availability",
  publicRateLimiter,
  validate("query", roomAvailabilityQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await bookingService.availability(req.query as unknown as RoomAvailabilityQuery),
    ),
  ),
);

roomBookingRouter.use(authenticate);

// ── Customer ─────────────────────────────────────────────────────
const customer = requireRole("CUSTOMER");

roomBookingRouter.get(
  "/mine",
  customer,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await bookingService.listMine(req.auth!.userId)),
  ),
);
roomBookingRouter.post(
  "/",
  customer,
  bookingRateLimiter,
  validate("body", createRoomBookingSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await bookingService.create(req.auth!, req.body, { byStaff: false }), {
      status: 201,
    }),
  ),
);
roomBookingRouter.post(
  "/:id/cancel",
  customer,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await bookingService.cancelMine(req.auth!, idParam(req))),
  ),
);

// ── Staff ────────────────────────────────────────────────────────
const manage = requirePermission(Permissions.ROOMS_MANAGE);

roomBookingRouter.get(
  "/",
  manage,
  validate("query", roomBookingListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await bookingService.listForStaff(
        req.auth!,
        req.query as unknown as z.infer<typeof roomBookingListQuerySchema>,
      ),
    ),
  ),
);
roomBookingRouter.post(
  "/staff",
  manage,
  validate("body", createStaffRoomBookingSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await bookingService.createForStaff(req.auth!, req.body), { status: 201 }),
  ),
);
roomBookingRouter.get(
  "/:id/free-rooms",
  manage,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await bookingService.freeRoomsForBooking(req.auth!, idParam(req))),
  ),
);
roomBookingRouter.patch(
  "/:id/status",
  manage,
  validate("body", updateRoomBookingStatusSchema),
  asyncHandler(async (req, res) => {
    const { status } = req.body as z.infer<typeof updateRoomBookingStatusSchema>;
    sendSuccess(res, await bookingService.setStatus(req.auth!, idParam(req), status));
  }),
);
roomBookingRouter.patch(
  "/:id/room",
  manage,
  validate("body", assignRoomSchema),
  asyncHandler(async (req, res) => {
    const { roomId } = req.body as z.infer<typeof assignRoomSchema>;
    sendSuccess(res, await bookingService.assignRoom(req.auth!, idParam(req), roomId));
  }),
);
