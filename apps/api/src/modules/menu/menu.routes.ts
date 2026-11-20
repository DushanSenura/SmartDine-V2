import {
  createCategorySchema,
  createMenuItemSchema,
  menuQuerySchema,
  Permissions,
  roleHasPermission,
  updateAvailabilitySchema,
  updateCategorySchema,
  updateMenuItemSchema,
  type MenuQuery,
} from "@smartdine/shared";
import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { publicRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { menuService } from "./menu.service";

const idParam = (req: { params: Record<string, unknown> }) => String(req.params.id);
const branchIdQuery = z.object({ branchId: z.uuid().optional() });
const itemQuery = z.object({ branchId: z.uuid() });

export const menuRouter: Router = Router();

// ── Public (no login) ────────────────────────────────────────────
menuRouter.get(
  "/",
  publicRateLimiter,
  validate("query", menuQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await menuService.publicMenu(req.query as unknown as MenuQuery)),
  ),
);
menuRouter.get(
  "/allergens",
  publicRateLimiter,
  asyncHandler(async (_req, res) => sendSuccess(res, await menuService.allergens())),
);
menuRouter.get(
  "/items/:slug",
  publicRateLimiter,
  validate("query", itemQuery),
  asyncHandler(async (req, res) => {
    const { branchId } = req.query as unknown as z.infer<typeof itemQuery>;
    sendSuccess(res, await menuService.publicItem(branchId, String(req.params.slug)));
  }),
);

// ── Staff ────────────────────────────────────────────────────────
const staff = Router();
staff.use(authenticate);

// Kitchen, managers and owners may view the full list (availability); cost is manager-only.
staff.get(
  "/admin",
  requirePermission(Permissions.MENU_AVAILABILITY),
  validate("query", branchIdQuery),
  asyncHandler(async (req, res) => {
    const { branchId } = req.query as z.infer<typeof branchIdQuery>;
    const includeCost = roleHasPermission(req.auth!.role, Permissions.MENU_MANAGE);
    sendSuccess(res, await menuService.adminList(req.auth!, branchId, includeCost));
  }),
);
staff.post(
  "/items",
  requirePermission(Permissions.MENU_MANAGE),
  validate("body", createMenuItemSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await menuService.create(req.auth!, req.body), { status: 201 }),
  ),
);
staff.patch(
  "/items/:id",
  requirePermission(Permissions.MENU_MANAGE),
  validate("body", updateMenuItemSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await menuService.update(req.auth!, idParam(req), req.body)),
  ),
);
staff.patch(
  "/items/:id/availability",
  requirePermission(Permissions.MENU_AVAILABILITY),
  validate("body", updateAvailabilitySchema),
  asyncHandler(async (req, res) => {
    const { availability } = req.body as z.infer<typeof updateAvailabilitySchema>;
    sendSuccess(res, await menuService.setAvailability(req.auth!, idParam(req), availability));
  }),
);
staff.delete(
  "/items/:id",
  requirePermission(Permissions.MENU_MANAGE),
  asyncHandler(async (req, res) => {
    await menuService.remove(req.auth!, idParam(req));
    sendSuccess(res, null);
  }),
);
menuRouter.use(staff);

// ── Categories ───────────────────────────────────────────────────
export const categoryRouter: Router = Router();

categoryRouter.get(
  "/",
  publicRateLimiter,
  asyncHandler(async (_req, res) => sendSuccess(res, await menuService.publicCategories())),
);

const manage = requirePermission(Permissions.MENU_MANAGE);
categoryRouter.get(
  "/admin",
  authenticate,
  manage,
  asyncHandler(async (_req, res) => sendSuccess(res, await menuService.adminCategories())),
);
categoryRouter.post(
  "/",
  authenticate,
  manage,
  validate("body", createCategorySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await menuService.createCategory(req.body), { status: 201 }),
  ),
);
categoryRouter.patch(
  "/:id",
  authenticate,
  manage,
  validate("body", updateCategorySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await menuService.updateCategory(idParam(req), req.body)),
  ),
);
categoryRouter.delete(
  "/:id",
  authenticate,
  manage,
  asyncHandler(async (req, res) => {
    await menuService.deleteCategory(idParam(req));
    sendSuccess(res, null);
  }),
);
