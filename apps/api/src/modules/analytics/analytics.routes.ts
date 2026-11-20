import {
  dashboardQuerySchema,
  Permissions,
  reportParamSchema,
  reportQuerySchema,
} from "@smartdine/shared";
import { Router } from "express";
import type { z } from "zod";

import { heavyRateLimiter } from "../../middleware/rateLimit";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { buildDashboard } from "./dashboard.service";
import { reportToCsv, reportToPdf } from "./report.render";
import { reportService } from "./report.service";

/** Dashboards and reports are for owners and managers. */
export const analyticsRouter: Router = Router();
analyticsRouter.use(heavyRateLimiter, authenticate, requirePermission(Permissions.REPORTS_VIEW));

analyticsRouter.get(
  "/dashboard",
  validate("query", dashboardQuerySchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await buildDashboard(req.auth!, req.query as unknown as z.infer<typeof dashboardQuerySchema>),
    ),
  ),
);

export const reportRouter: Router = Router();
reportRouter.use(heavyRateLimiter, authenticate, requirePermission(Permissions.REPORTS_VIEW));

reportRouter.get(
  "/:type",
  validate("params", reportParamSchema),
  validate("query", reportQuerySchema),
  asyncHandler(async (req, res) => {
    const { format, ...query } = req.query as unknown as z.infer<typeof reportQuerySchema>;
    const type = req.params.type as z.infer<typeof reportParamSchema>["type"];
    const report = await reportService.run(req.auth!, type, query);
    const filename = `${type}-${report.from}-to-${report.to}`;
    if (format === "csv") {
      res
        .status(200)
        .type("text/csv; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="${filename}.csv"`)
        .set("Cache-Control", "private, no-store")
        .send(reportToCsv(report));
      return;
    }
    if (format === "pdf") {
      res
        .status(200)
        .type("application/pdf")
        .set("Content-Disposition", `attachment; filename="${filename}.pdf"`)
        .set("Cache-Control", "private, no-store")
        .send(reportToPdf(report));
      return;
    }
    sendSuccess(res, report);
  }),
);
