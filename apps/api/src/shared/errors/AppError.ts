import { ErrorCodes, type ErrorCode } from "@smartdine/shared";

/** Expected, client-presentable failure. Anything else is treated as an internal error. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static validation(message: string, details?: unknown) {
    return new AppError(400, ErrorCodes.VALIDATION_ERROR, message, details);
  }
  static unauthenticated(message = "Authentication required.") {
    return new AppError(401, ErrorCodes.UNAUTHENTICATED, message);
  }
  static forbidden(message = "You do not have permission to perform this action.") {
    return new AppError(403, ErrorCodes.FORBIDDEN, message);
  }
  static notFound(message = "The requested resource was not found.") {
    return new AppError(404, ErrorCodes.NOT_FOUND, message);
  }
  static conflict(code: ErrorCode, message: string) {
    return new AppError(409, code, message);
  }
  static unavailable(message = "Service temporarily unavailable.") {
    return new AppError(503, ErrorCodes.SERVICE_UNAVAILABLE, message);
  }
}
