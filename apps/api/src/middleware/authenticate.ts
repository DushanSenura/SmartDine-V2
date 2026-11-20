import type { RequestHandler } from "express";

import { verifyAccessToken } from "../modules/auth/token.service";
import { AppError } from "../shared/errors/AppError";

/** Requires a valid `Authorization: Bearer <access token>` and populates `req.auth`. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(AppError.unauthenticated());
    return;
  }
  try {
    req.auth = verifyAccessToken(header.slice("Bearer ".length));
    next();
  } catch (error) {
    next(error);
  }
};
