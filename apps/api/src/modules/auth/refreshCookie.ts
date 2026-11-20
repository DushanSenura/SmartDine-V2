import type { CookieOptions, Request, Response } from "express";

import { env } from "../../config/env";

export const REFRESH_COOKIE = "sd_refresh";

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
  // Strict + a path scoped to /auth: the cookie is never sent with cross-site or ordinary API calls.
  sameSite: "strict",
  path: "/api/v2/auth",
});

export const setRefreshCookie = (res: Response, token: string, expires: Date) =>
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(), expires });

export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, baseOptions());

export const readRefreshCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" ? value : undefined;
};

export const clientInfo = (req: Request) => ({
  userAgent: req.headers["user-agent"]?.slice(0, 255),
  ip: req.ip,
});
