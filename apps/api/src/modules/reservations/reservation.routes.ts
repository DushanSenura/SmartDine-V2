import {
  availabilityQuerySchema,
  createPrivateReservationSchema,
  createReservationSchema,
  createStaffReservationSchema,
  Permissions,
  privateAvailabilityQuerySchema,
  reservationListQuerySchema,
  updateReservationStatusSchema,
  type AvailabilityQuery,
} from "@smartdine/shared";
import { Router } from "express";
import { type z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireRole } from "../../middleware/authorize";
import { bookingRateLimiter, publicRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { reservationService } from "./reservation.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);

export const reservationRouter: Router = Router();

// ── Public availability (no login) ───────────────────────────────
reservationRouter.get(
  "/availability",
  publicRateLimiter,
  validate("query", availabilityQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await reservationService.availability(req.query as unknown as AvailabilityQuery),
    ),
  ),
);
reservationRouter.get(
  "/private/availability",
  publicRateLimiter,
  validate("query", privateAvailabilityQuerySchema),
  asyncHandler(async (req, res) => {
    const { roomId, date } = req.query as unknown as z.infer<typeof privateAvailabilityQuerySchema>;
    sendSuccess(res, await reservationService.privateAvailability(roomId, date));
  }),
);

reservationRouter.use(authenticate);

// ── Customer ─────────────────────────────────────────────────────
const customer = requireRole("CUSTOMER");

reservationRouter.get(
  "/mine",
  customer,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await reservationService.listMine(req.auth!.userId)),
  ),
);
reservationRouter.post(
  "/",
  customer,
  bookingRateLimiter,
  validate("body", createReservationSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await reservationService.createTableReservation(req.auth!, req.body, { byStaff: false }),
      { status: 201 },
    ),
  ),
);
reservationRouter.post(
  "/private",
  customer,
  bookingRateLimiter,
  validate("body", createPrivateReservationSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await reservationService.createPrivateReservation(req.auth!, req.body), {
      status: 201,
    }),
  ),
);
reservationRouter.post(
  "/:id/cancel",
  customer,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await reservationService.cancelMine(req.auth!, idParam(req))),
  ),
);

// ── Staff ────────────────────────────────────────────────────────
const manage = requirePermission(Permissions.RESERVATIONS_MANAGE);

reservationRouter.get(
  "/",
  manage,
  validate("query", reservationListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await reservationService.listForStaff(
        req.auth!,
        req.query as unknown as z.infer<typeof reservationListQuerySchema>,
      ),
    ),
  ),
);
reservationRouter.post(
  "/staff",
  manage,
  validate("body", createStaffReservationSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await reservationService.createForStaff(req.auth!, req.body), { status: 201 }),
  ),
);
reservationRouter.patch(
  "/:id/status",
  manage,
  validate("body", updateReservationStatusSchema),
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body as z.infer<typeof updateReservationStatusSchema>;
    sendSuccess(res, await reservationService.setStatus(req.auth!, idParam(req), status, reason));
  }),
);
