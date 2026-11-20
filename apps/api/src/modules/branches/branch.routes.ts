import {
  createBranchSchema,
  Permissions,
  STAFF_ROLES,
  updateBranchSchema,
} from "@smartdine/shared";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireRole } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { branchService } from "./branch.service";

export const branchRouter: Router = Router();

branchRouter.use(authenticate);

// Any staff member can read the branch(es) they may access; writes are owner-only.
const staffOnly = requireRole(...STAFF_ROLES);
const manageBranches = requirePermission(Permissions.BRANCHES_MANAGE);
const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);

branchRouter.get(
  "/",
  staffOnly,
  asyncHandler(async (req, res) => sendSuccess(res, await branchService.list(req.auth!))),
);
branchRouter.get(
  "/:id",
  staffOnly,
  asyncHandler(async (req, res) =>
    sendSuccess(res, await branchService.get(req.auth!, idParam(req))),
  ),
);
branchRouter.post(
  "/",
  manageBranches,
  validate("body", createBranchSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await branchService.create(req.body, req.auth), { status: 201 }),
  ),
);
branchRouter.patch(
  "/:id",
  manageBranches,
  validate("body", updateBranchSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await branchService.update(idParam(req), req.body, req.auth)),
  ),
);
branchRouter.delete(
  "/:id",
  manageBranches,
  asyncHandler(async (req, res) => {
    await branchService.remove(idParam(req), req.auth);
    sendSuccess(res, null);
  }),
);
