import { Prisma } from "@prisma/client";
import { ErrorCodes, type ApiFailure } from "@smartdine/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../shared/errors/AppError";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound("Route not found."));
};

function isBodyParseError(error: unknown): error is { status: number; type: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    typeof error.type === "string" &&
    error.type.startsWith("entity.")
  );
}

/** Prisma P2023: "Inconsistent column data", e.g. a malformed UUID in a where clause. */
function isMalformedIdentifier(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2023";
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  let status = 500;
  let body: ApiFailure = {
    success: false,
    error: { code: ErrorCodes.INTERNAL_ERROR, message: "Something went wrong on our side." },
  };

  if (error instanceof AppError) {
    status = error.status;
    body = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
    };
  } else if (isMalformedIdentifier(error)) {
    // A path id that isn't a UUID reaches Prisma before any lookup; it is the caller's mistake.
    status = 404;
    body = {
      success: false,
      error: { code: ErrorCodes.NOT_FOUND, message: "Resource not found." },
    };
  } else if (isBodyParseError(error)) {
    status = error.status;
    body = {
      success: false,
      error: { code: ErrorCodes.VALIDATION_ERROR, message: "Malformed or oversized request body." },
    };
  }

  if (status >= 500) {
    logger.error({ err: error, reqId: req.id }, "Unhandled request error");
  }

  // Never leak internals in production; stack is only attached for local debugging.
  if (status >= 500 && env.NODE_ENV === "development" && error instanceof Error) {
    body.error.details = { stack: error.stack };
  }

  res.status(status).json(body);
};
