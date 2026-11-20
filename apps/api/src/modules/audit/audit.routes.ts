import { auditQuerySchema, Permissions } from "@smartdine/shared";
import { Router } from "express";
import type { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { auditService } from "./audit.service";

/** Owners inspect the audit trail; nobody can change it through the API. */
export const auditRouter: Router = Router();
auditRouter.use(authenticate, requirePermission(Permissions.AUDIT_VIEW));

auditRouter.get(
  "/",
  validate("query", auditQuerySchema),
  asyncHandler(async (req, res) => {
    const { entries, meta } = await auditService.list(
      req.query as unknown as z.infer<typeof auditQuerySchema>,
    );
    sendSuccess(res, entries, { meta });
  }),
);
