import type { RequestHandler } from "express";

import { env } from "../config/env";
import { AppError } from "../shared/errors/AppError";

/**
 * CSRF defence in depth for cookie-authenticated endpoints (refresh / logout), on top of
 * SameSite=Strict: a browser-supplied Origin must be one of the configured origins.
 * Requests without an Origin header (non-browser clients) are allowed; they hold no ambient cookie.
 */
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (origin && !env.CORS_ORIGINS.includes(origin)) {
    next(AppError.forbidden("Untrusted request origin."));
    return;
  }
  next();
};
