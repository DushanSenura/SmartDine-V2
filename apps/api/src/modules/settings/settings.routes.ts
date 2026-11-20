import { Permissions, updateCompanySchema, updateCompanySettingsSchema } from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireRole } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { settingsService } from "./settings.service";

const updateSettingsSchema = z.object({
  company: updateCompanySchema.optional(),
  settings: updateCompanySettingsSchema.optional(),
});

export const settingsRouter: Router = Router();

settingsRouter.use(authenticate);

// Managers may read company settings (tax, reservation rules); only the owner can change them.
settingsRouter.get(
  "/",
  requireRole("OWNER", "MANAGER"),
  asyncHandler(async (_req, res) => sendSuccess(res, await settingsService.get())),
);
settingsRouter.put(
  "/",
  requirePermission(Permissions.SETTINGS_MANAGE),
  validate("body", updateSettingsSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await settingsService.update(req.body, req.auth)),
  ),
);
