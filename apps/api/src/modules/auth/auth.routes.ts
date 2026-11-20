import { loginSchema, registerCustomerSchema } from "@smartdine/shared";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { authRateLimiter } from "../../middleware/rateLimit";
import { requireTrustedOrigin } from "../../middleware/trustedOrigin";
import { validate } from "../../middleware/validate";
import { login, logout, me, refresh, register } from "./auth.controller";

export const authRouter: Router = Router();

authRouter.post("/register", authRateLimiter, validate("body", registerCustomerSchema), register);
authRouter.post("/login", authRateLimiter, validate("body", loginSchema), login);
authRouter.post("/refresh", requireTrustedOrigin, refresh);
authRouter.post("/logout", requireTrustedOrigin, logout);
authRouter.get("/me", authenticate, me);
