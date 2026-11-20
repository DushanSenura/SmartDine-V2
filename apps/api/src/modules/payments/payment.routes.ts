import {
  applyDiscountSchema,
  applyPromoSchema,
  attachCustomerSchema,
  createBillSchema,
  payBillSchema,
  paymentListQuerySchema,
  paymentSummaryQuerySchema,
  Permissions,
  redeemPointsSchema,
  refundSchema,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { billService } from "./bill.service";
import { paymentService } from "./payment.service";
import { receiptService } from "./receipt.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const process = requirePermission(Permissions.PAYMENTS_PROCESS);
const branchQuery = z.object({ branchId: z.uuid().optional() });

// ── Bills ────────────────────────────────────────────────────────
export const billRouter: Router = Router();
billRouter.use(authenticate, process);

billRouter.get(
  "/queue",
  validate("query", branchQuery),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await billService.queue(req.auth!, req.query.branchId as string | undefined)),
  ),
);
billRouter.post(
  "/",
  validate("body", createBillSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await billService.generate(req.auth!, req.body.orderId)),
  ),
);
billRouter.get(
  "/:id",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await billService.get(req.auth!, idParam(req))),
  ),
);
billRouter.patch(
  "/:id/discount",
  validate("body", applyDiscountSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await billService.applyDiscount(req.auth!, idParam(req), req.body)),
  ),
);
billRouter.put(
  "/:id/promo",
  validate("body", applyPromoSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await billService.applyPromo(req.auth!, idParam(req), req.body.code)),
  ),
);
billRouter.delete(
  "/:id/promo",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await billService.removePromo(req.auth!, idParam(req))),
  ),
);
billRouter.put(
  "/:id/customer",
  validate("body", attachCustomerSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await billService.attachCustomer(req.auth!, idParam(req), req.body.customerId),
    ),
  ),
);
billRouter.post(
  "/:id/redeem",
  validate("body", redeemPointsSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await paymentService.redeemPoints(req.auth!, idParam(req), req.body.points), {
      status: 201,
    }),
  ),
);
billRouter.post(
  "/:id/payments",
  validate("body", payBillSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await paymentService.pay(req.auth!, idParam(req), req.body), { status: 201 }),
  ),
);

// ── Payments ─────────────────────────────────────────────────────
export const paymentRouter: Router = Router();
paymentRouter.use(authenticate, process);

paymentRouter.get(
  "/",
  validate("query", paymentListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await paymentService.list(
        req.auth!,
        req.query as unknown as z.infer<typeof paymentListQuerySchema>,
      ),
    ),
  ),
);
paymentRouter.get(
  "/summary",
  validate("query", paymentSummaryQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await paymentService.summary(
        req.auth!,
        req.query as unknown as z.infer<typeof paymentSummaryQuerySchema>,
      ),
    ),
  ),
);
paymentRouter.post(
  "/:id/refund",
  requirePermission(Permissions.PAYMENTS_REFUND),
  validate("body", refundSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await paymentService.refund(req.auth!, idParam(req), req.body), {
      status: 201,
    }),
  ),
);

// ── Receipts ─────────────────────────────────────────────────────
export const receiptRouter: Router = Router();
receiptRouter.use(authenticate, process);

receiptRouter.get(
  "/:id",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await receiptService.get(req.auth!, idParam(req))),
  ),
);
receiptRouter.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const { filename, body } = await receiptService.pdf(req.auth!, idParam(req));
    res
      .status(200)
      .type("application/pdf")
      .set("Content-Disposition", `inline; filename="${filename}"`)
      .set("Cache-Control", "private, no-store")
      .send(body);
  }),
);

receiptRouter.post(
  "/:id/email",
  validate("body", z.object({ to: z.email().max(254).optional() })),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await receiptService.email(req.auth!, idParam(req), req.body.to)),
  ),
);

// ── Room folios ──────────────────────────────────────────────────
export const folioRouter: Router = Router();
folioRouter.use(
  authenticate,
  requireAnyPermission(Permissions.PAYMENTS_PROCESS, Permissions.ROOMS_MANAGE),
);
folioRouter.get(
  "/:id",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await paymentService.folio(req.auth!, idParam(req))),
  ),
);
