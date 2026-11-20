import type { PaginationQuery } from "@smartdine/shared";

import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { clientInfo, setRefreshCookie } from "../auth/refreshCookie";
import { userService } from "./user.service";

export const updateMe = asyncHandler(async (req, res) => {
  sendSuccess(res, await userService.updateProfile(req.auth!.userId, req.body));
});

export const changeMyPassword = asyncHandler(async (req, res) => {
  const issued = await userService.changePassword(req.auth!.userId, req.body, clientInfo(req));
  setRefreshCookie(res, issued.refreshToken, issued.refreshExpiresAt);
  sendSuccess(res, issued.session);
});

export const createStaff = asyncHandler(async (req, res) => {
  sendSuccess(res, await userService.createStaff(req.auth!.role, req.body), { status: 201 });
});

export const listUsers = asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query as unknown as PaginationQuery;
  const { users, meta } = await userService.list(req.auth!.role, page, pageSize);
  sendSuccess(res, users, { meta });
});
