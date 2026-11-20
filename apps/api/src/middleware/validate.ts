import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { AppError } from "../shared/errors/AppError";

type Source = "body" | "query" | "params";

/**
 * Validates one part of the request against a Zod schema and replaces it with the parsed value.
 * Express 5 exposes `req.query` as a getter, so parsed values are defined as own properties.
 */
export const validate =
  (source: Source, schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      next(AppError.validation("Request validation failed.", issues));
      return;
    }
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
