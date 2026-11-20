import type { Response } from "express";

import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { authService, type IssuedSession } from "./auth.service";
import {
  clearRefreshCookie,
  clientInfo,
  readRefreshCookie,
  setRefreshCookie,
} from "./refreshCookie";

function respondWithSession(res: Response, issued: IssuedSession, status = 200) {
  setRefreshCookie(res, issued.refreshToken, issued.refreshExpiresAt);
  return sendSuccess(res, issued.session, { status });
}

export const register = asyncHandler(async (req, res) => {
  respondWithSession(res, await authService.registerCustomer(req.body, clientInfo(req)), 201);
});

export const login = asyncHandler(async (req, res) => {
  respondWithSession(res, await authService.login(req.body, clientInfo(req)));
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    respondWithSession(res, await authService.refresh(readRefreshCookie(req), clientInfo(req)));
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  sendSuccess(res, null);
});

export const me = asyncHandler(async (req, res) => {
  // `authenticate` guarantees req.auth.
  sendSuccess(res, await authService.getCurrentUser(req.auth!.userId));
});
