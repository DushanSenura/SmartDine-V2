import { ErrorCodes, type ApiFailure } from "@smartdine/shared";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request } from "express";

import { env } from "../config/env";
import { verifyAccessToken } from "../modules/auth/token.service";

const body: ApiFailure = {
  success: false,
  error: { code: ErrorCodes.RATE_LIMITED, message: "Too many requests. Please slow down." },
};

const isTest = env.NODE_ENV === "test";

/**
 * Signed-in staff are counted per user, not per address. A restaurant puts every waiter, cook and
 * cashier device behind one network address, and live screens refetch on each change, so a shared
 * per-IP budget would lock the floor out. Only a verified access token earns the per-user key (a
 * forged one fails verification and falls back to the IP), so this cannot be used to dodge the limit.
 */
export function globalKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      return `user:${verifyAccessToken(header.slice("Bearer ".length)).userId}`;
    } catch {
      // expired or invalid: counted as anonymous below
    }
  }
  return ipKeyGenerator(req.ip ?? "unknown");
}

/** Baseline limiter for the whole API. */
export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 300,
  keyGenerator: globalKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: body,
});

/** Brute-force protection for credential endpoints (login, register). */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: isTest ? 10_000 : env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: body,
});

/** Anonymous public endpoints (menu, availability). Generous, but bounded per IP. */
export const publicRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: body,
});

/** Creating reservations is more expensive and abuse-prone than reading. */
export const bookingRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: isTest ? 10_000 : env.BOOKING_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: body,
});

/** Dashboards and report exports aggregate a lot of rows; a tighter per-user budget keeps one client from hogging the database. */
export const heavyRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 40,
  keyGenerator: globalKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: body,
});
