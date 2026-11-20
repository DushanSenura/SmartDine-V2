import {
  createReviewSchema,
  moderateReviewSchema,
  Permissions,
  reviewListQuerySchema,
} from "@smartdine/shared";
import { Router } from "express";
import { type z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireRole } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { reviewService } from "./review.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const customerOnly = requireRole("CUSTOMER");

export const reviewRouter: Router = Router();
reviewRouter.use(authenticate);

// Customers
reviewRouter.get(
  "/reviewable",
  customerOnly,
  asyncHandler(async (req, res) => sendSuccess(res, await reviewService.reviewable(req.auth!))),
);
reviewRouter.get(
  "/mine",
  customerOnly,
  asyncHandler(async (req, res) => sendSuccess(res, await reviewService.mine(req.auth!))),
);
reviewRouter.post(
  "/",
  customerOnly,
  validate("body", createReviewSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await reviewService.create(req.auth!, req.body), { status: 201 }),
  ),
);

// Staff
reviewRouter.get(
  "/",
  requirePermission(Permissions.CUSTOMERS_MANAGE),
  validate("query", reviewListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await reviewService.list(
        req.auth!,
        req.query as unknown as z.infer<typeof reviewListQuerySchema>,
      ),
    ),
  ),
);
reviewRouter.patch(
  "/:id",
  requirePermission(Permissions.CUSTOMERS_MANAGE),
  validate("body", moderateReviewSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await reviewService.moderate(req.auth!, idParam(req), req.body)),
  ),
);
