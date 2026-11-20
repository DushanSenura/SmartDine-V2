import {
  tableLookupQuerySchema,
  tableOrderSchema,
  waiterOptionsQuerySchema,
} from "@smartdine/shared";
import { Router } from "express";
import type { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/authorize";
import { bookingRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { orderService } from "../orders/order.service";

/**
 * Customers ordering from their table. Signed-in customers only, so every order is traceable to a
 * person. The order reaches the kitchen, the chosen waiter and the cashier through the same paths
 * as a waiter-entered order.
 */
export const tableOrderRouter: Router = Router();
tableOrderRouter.use(authenticate, requireRole("CUSTOMER"));

tableOrderRouter.get(
  "/waiters",
  validate("query", waiterOptionsQuerySchema),
  asyncHandler(async (req, res) => {
    const { branchId } = req.query as unknown as z.infer<typeof waiterOptionsQuerySchema>;
    sendSuccess(res, await orderService.waiterOptions(branchId));
  }),
);

tableOrderRouter.get(
  "/table",
  validate("query", tableLookupQuerySchema),
  asyncHandler(async (req, res) => {
    const { branchId, tableNumber } = req.query as unknown as z.infer<
      typeof tableLookupQuerySchema
    >;
    sendSuccess(res, await orderService.lookupTable(branchId, tableNumber));
  }),
);

tableOrderRouter.get(
  "/mine",
  asyncHandler(async (req, res) => sendSuccess(res, await orderService.listMine(req.auth!))),
);

tableOrderRouter.post(
  "/",
  bookingRateLimiter,
  validate("body", tableOrderSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await orderService.createForTable(req.auth!, req.body), { status: 201 }),
  ),
);
