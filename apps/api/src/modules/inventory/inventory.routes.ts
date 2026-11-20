import {
  createInventoryItemSchema,
  inventoryListQuerySchema,
  Permissions,
  stockMovementSchema,
  stockTransactionQuerySchema,
  supplierSchema,
  updateInventoryItemSchema,
  updateSupplierSchema,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { inventoryService } from "./inventory.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const manage = requirePermission(Permissions.INVENTORY_MANAGE);
const branchQuery = z.object({ branchId: z.uuid().optional() });

export const inventoryRouter: Router = Router();
inventoryRouter.use(authenticate, manage);

inventoryRouter.get(
  "/items",
  validate("query", inventoryListQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await inventoryService.listItems(
        req.auth!,
        req.query as unknown as z.infer<typeof inventoryListQuerySchema>,
      ),
    ),
  ),
);
inventoryRouter.get(
  "/summary",
  validate("query", branchQuery),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await inventoryService.summary(req.auth!, req.query.branchId as string | undefined),
    ),
  ),
);
inventoryRouter.post(
  "/items",
  validate("body", createInventoryItemSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await inventoryService.createItem(req.auth!, req.body), { status: 201 }),
  ),
);
inventoryRouter.patch(
  "/items/:id",
  validate("body", updateInventoryItemSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await inventoryService.updateItem(req.auth!, idParam(req), req.body)),
  ),
);
inventoryRouter.delete(
  "/items/:id",
  asyncHandler(async (req, res) => {
    await inventoryService.deleteItem(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
inventoryRouter.post(
  "/items/:id/movements",
  validate("body", stockMovementSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await inventoryService.move(req.auth!, idParam(req), req.body), {
      status: 201,
    }),
  ),
);
inventoryRouter.get(
  "/transactions",
  validate("query", stockTransactionQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await inventoryService.transactions(
        req.auth!,
        req.query as unknown as z.infer<typeof stockTransactionQuerySchema>,
      ),
    ),
  ),
);

export const supplierRouter: Router = Router();
supplierRouter.use(authenticate, manage);

supplierRouter.get(
  "/",
  asyncHandler(async (_req, res) => sendSuccess(res, await inventoryService.listSuppliers())),
);
supplierRouter.post(
  "/",
  validate("body", supplierSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await inventoryService.createSupplier(req.body), { status: 201 }),
  ),
);
supplierRouter.patch(
  "/:id",
  validate("body", updateSupplierSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await inventoryService.updateSupplier(idParam(req), req.body)),
  ),
);
supplierRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await inventoryService.deleteSupplier(idParam(req));
    sendSuccess(res, null);
  }),
);
