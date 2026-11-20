import {
  customerListQuerySchema,
  customerLookupQuerySchema,
  loyaltyAdjustSchema,
  Permissions,
  updateCustomerSchema,
  updateMyProfileSchema,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requireAnyPermission, requirePermission, requireRole } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { receiptService } from "../payments/receipt.service";
import { customerService } from "./customer.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const manage = requirePermission(Permissions.CUSTOMERS_MANAGE);
const customerOnly = requireRole("CUSTOMER");

export const customerRouter: Router = Router();
customerRouter.use(authenticate);

// ── The signed-in customer (declared before "/:id") ──────────────
customerRouter.get(
  "/me",
  customerOnly,
  asyncHandler(async (req, res) => sendSuccess(res, await customerService.me(req.auth!))),
);
customerRouter.patch(
  "/me",
  customerOnly,
  validate("body", updateMyProfileSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await customerService.updateMe(req.auth!, req.body)),
  ),
);
customerRouter.get(
  "/me/loyalty",
  customerOnly,
  asyncHandler(async (req, res) => sendSuccess(res, await customerService.myLoyalty(req.auth!))),
);
customerRouter.get(
  "/me/invoices",
  customerOnly,
  asyncHandler(async (req, res) => sendSuccess(res, await customerService.myInvoices(req.auth!))),
);
customerRouter.get(
  "/me/receipts/:id",
  customerOnly,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await receiptService.getForCustomer(req.auth!, idParam(req))),
  ),
);
customerRouter.get(
  "/me/receipts/:id/pdf",
  customerOnly,
  asyncHandler(async (req, res) => {
    const { filename, body } = await receiptService.pdfForCustomer(req.auth!, idParam(req));
    res
      .status(200)
      .type("application/pdf")
      .set("Content-Disposition", `inline; filename="${filename}"`)
      .set("Cache-Control", "private, no-store")
      .send(body);
  }),
);

// ── Staff ────────────────────────────────────────────────────────
customerRouter.get(
  "/lookup",
  requireAnyPermission(Permissions.PAYMENTS_PROCESS, Permissions.CUSTOMERS_MANAGE),
  validate("query", customerLookupQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await customerService.lookup(String(req.query.q))),
  ),
);
customerRouter.get(
  "/",
  manage,
  validate("query", customerListQuerySchema),
  asyncHandler(async (req, res) => {
    const { customers, meta } = await customerService.list(
      req.query as unknown as z.infer<typeof customerListQuerySchema>,
    );
    sendSuccess(res, customers, { meta });
  }),
);
customerRouter.get(
  "/:id",
  manage,
  asyncHandler(async (req, res) => sendSuccess(res, await customerService.get(idParam(req)))),
);
customerRouter.patch(
  "/:id",
  manage,
  validate("body", updateCustomerSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await customerService.update(idParam(req), req.body)),
  ),
);
customerRouter.post(
  "/:id/loyalty",
  manage,
  validate("body", loyaltyAdjustSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await customerService.adjustPoints(req.auth!, idParam(req), req.body), {
      status: 201,
    }),
  ),
);

// ── Favourites ───────────────────────────────────────────────────
export const favouriteRouter: Router = Router();
favouriteRouter.use(authenticate, customerOnly);

favouriteRouter.get(
  "/",
  asyncHandler(async (req, res) => sendSuccess(res, await customerService.favourites(req.auth!))),
);
const uuidParam = z.object({ id: z.uuid() });
favouriteRouter.put(
  "/:id",
  validate("params", uuidParam),
  asyncHandler(async (req, res) => {
    await customerService.addFavourite(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
favouriteRouter.delete(
  "/:id",
  validate("params", uuidParam),
  asyncHandler(async (req, res) => {
    await customerService.removeFavourite(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
