import {
  changePasswordSchema,
  createStaffUserSchema,
  paginationQuerySchema,
  updateProfileSchema,
} from "@smartdine/shared";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { requireRole } from "../../middleware/authorize";
import { authRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { changeMyPassword, createStaff, listUsers, updateMe } from "./user.controller";

export const userRouter: Router = Router();

userRouter.use(authenticate);

userRouter.patch("/me", validate("body", updateProfileSchema), updateMe);
userRouter.post(
  "/me/password",
  authRateLimiter,
  validate("body", changePasswordSchema),
  changeMyPassword,
);

// Account administration: owners and managers (role-assignment limits are enforced in the service).
const admin = requireRole("OWNER", "MANAGER");
userRouter.get("/", admin, validate("query", paginationQuerySchema), listUsers);
userRouter.post("/", admin, validate("body", createStaffUserSchema), createStaff);
