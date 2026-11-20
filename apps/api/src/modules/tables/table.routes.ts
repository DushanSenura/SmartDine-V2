import {
  assignWaiterSchema,
  branchQuerySchema,
  createDiningAreaSchema,
  createTableSchema,
  Permissions,
  saveLayoutSchema,
  updateDiningAreaSchema,
  updateTableSchema,
  updateTableStatusSchema,
} from "@smartdine/shared";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { tableService } from "./table.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const branchOf = (req: { query: unknown }) => (req.query as { branchId?: string }).branchId;

export const tableRouter: Router = Router();

tableRouter.use(authenticate);

const view = requirePermission(Permissions.TABLES_VIEW);
const manage = requirePermission(Permissions.TABLES_MANAGE);

// Static paths are registered before `/:id`.
tableRouter.get(
  "/areas",
  view,
  validate("query", branchQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await tableService.listAreas(req.auth!, branchOf(req))),
  ),
);
tableRouter.post(
  "/areas",
  manage,
  validate("body", createDiningAreaSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await tableService.createArea(req.auth!, req.body), { status: 201 }),
  ),
);
tableRouter.patch(
  "/areas/:id",
  manage,
  validate("body", updateDiningAreaSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await tableService.updateArea(req.auth!, idParam(req), req.body)),
  ),
);
tableRouter.delete(
  "/areas/:id",
  manage,
  asyncHandler(async (req, res) => {
    await tableService.deleteArea(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);

tableRouter.put(
  "/layout",
  manage,
  validate("body", saveLayoutSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await tableService.saveLayout(req.auth!, req.body)),
  ),
);
tableRouter.post(
  "/assign-waiter",
  manage,
  validate("body", assignWaiterSchema),
  asyncHandler(async (req, res) => {
    const { tableIds, waiterId } = req.body as { tableIds: string[]; waiterId: string | null };
    sendSuccess(res, await tableService.assignWaiter(req.auth!, tableIds, waiterId));
  }),
);

tableRouter.get(
  "/",
  view,
  validate("query", branchQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await tableService.listTables(req.auth!, branchOf(req))),
  ),
);
tableRouter.post(
  "/",
  manage,
  validate("body", createTableSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await tableService.createTable(req.auth!, req.body), { status: 201 }),
  ),
);
tableRouter.patch(
  "/:id",
  manage,
  validate("body", updateTableSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await tableService.updateTable(req.auth!, idParam(req), req.body)),
  ),
);
tableRouter.patch(
  "/:id/status",
  requirePermission(Permissions.TABLES_STATUS),
  validate("body", updateTableStatusSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await tableService.setStatus(req.auth!, idParam(req), (req.body as { status: never }).status),
    ),
  ),
);
tableRouter.delete(
  "/:id",
  manage,
  asyncHandler(async (req, res) => {
    await tableService.deleteTable(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
