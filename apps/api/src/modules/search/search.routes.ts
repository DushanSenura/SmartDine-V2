import { searchQuerySchema, STAFF_ROLES } from "@smartdine/shared";
import { Router } from "express";
import type { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { searchEverything } from "./search.service";

export const searchRouter: Router = Router();
searchRouter.use(authenticate, requireRole(...STAFF_ROLES));

searchRouter.get(
  "/",
  validate("query", searchQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, branchId } = req.query as unknown as z.infer<typeof searchQuerySchema>;
    sendSuccess(res, await searchEverything(req.auth!, q, branchId));
  }),
);
