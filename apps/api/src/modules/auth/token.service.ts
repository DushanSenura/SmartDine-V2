import { createHash, randomBytes } from "node:crypto";

import { Roles, type Role } from "@smartdine/shared";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/AppError";
import type { AuthContext } from "../../types/express";

const ALGORITHM = "HS256";

interface AccessClaims {
  sub: string;
  role: Role;
  branchId: string | null;
}

export function signAccessToken(context: AuthContext): string {
  const claims: AccessClaims = {
    sub: context.userId,
    role: context.role,
    branchId: context.branchId,
  };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AuthContext {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });
    if (typeof decoded === "string") throw new Error("unexpected payload");
    const { sub, role, branchId } = decoded as Partial<AccessClaims>;
    if (!sub || !role || !(role in Roles)) throw new Error("malformed claims");
    return { userId: sub, role, branchId: branchId ?? null };
  } catch {
    throw AppError.unauthenticated("Your session has expired. Please sign in again.");
  }
}

/** Opaque 256-bit refresh token; only its SHA-256 is stored. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("hex");
