import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { AppError } from "../../shared/errors/AppError";
import { getLiveness, getReadiness } from "./health.service";

export const liveness = asyncHandler(async (_req, res) => {
  sendSuccess(res, getLiveness());
});

export const readiness = asyncHandler(async (_req, res) => {
  const result = await getReadiness();
  if (result.status !== "ready") {
    throw AppError.unavailable("Database is unreachable.");
  }
  sendSuccess(res, result);
});
