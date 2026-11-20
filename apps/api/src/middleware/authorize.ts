import { roleHasPermission, type Permission, type Role } from "@smartdine/shared";
import type { RequestHandler } from "express";

import { AppError } from "../shared/errors/AppError";

/** Must run after `authenticate`. Requires the caller's role to hold every listed permission. */
export const requirePermission =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthenticated());
      return;
    }
    const { role } = req.auth;
    if (!permissions.every((permission) => roleHasPermission(role, permission))) {
      next(AppError.forbidden());
      return;
    }
    next();
  };

/** Must run after `authenticate`. Allows any of the listed roles. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthenticated());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };

/** Must run after `authenticate`. Allows callers holding at least one of the listed permissions. */
export const requireAnyPermission =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthenticated());
      return;
    }
    const { role } = req.auth;
    if (!permissions.some((permission) => roleHasPermission(role, permission))) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
