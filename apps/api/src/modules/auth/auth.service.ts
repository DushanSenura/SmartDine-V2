import { randomUUID } from "node:crypto";

import {
  Roles,
  type AuthSession,
  type LoginInput,
  type RegisterCustomerInput,
} from "@smartdine/shared";
import { Prisma } from "@prisma/client";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/AppError";
import { toAuthUser } from "../users/user.mapper";
import { userRepository, type UserWithRole } from "../users/user.repository";
import { refreshTokenRepository } from "./auth.repository";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "./token.service";

export interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** A just-rotated token presented again within this window is treated as a client race, not theft. */
const ROTATION_GRACE_MS = 10_000;

async function issueSession(
  user: UserWithRole,
  client: ClientInfo,
  familyId: string = randomUUID(),
): Promise<IssuedSession> {
  const { token, hash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await refreshTokenRepository.create({
    userId: user.id,
    tokenHash: hash,
    familyId,
    expiresAt: refreshExpiresAt,
    ...client,
  });
  const authUser = toAuthUser(user);
  const accessToken = signAccessToken({
    userId: user.id,
    role: authUser.role,
    branchId: user.branchId,
  });
  return { session: { accessToken, user: authUser }, refreshToken: token, refreshExpiresAt };
}

export const authService = {
  async registerCustomer(input: RegisterCustomerInput, client: ClientInfo) {
    try {
      const user = await userRepository.create({
        ...input,
        passwordHash: await hashPassword(input.password),
        roleName: Roles.CUSTOMER,
      });
      return issueSession(user, client);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw AppError.conflict("EMAIL_TAKEN", "An account with this email already exists.");
      }
      throw error;
    }
  },

  async login(input: LoginInput, client: ClientInfo) {
    const user = await userRepository.findByEmail(input.email);
    // Always run one bcrypt comparison so response time does not reveal whether the email exists.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
    }
    if (user.status !== "ACTIVE") {
      throw new AppError(403, "ACCOUNT_DISABLED", "This account has been disabled.");
    }
    await userRepository.update(user.id, { lastLoginAt: new Date() });
    return issueSession(user, client);
  },

  /** Rotates the refresh token. Presenting an already-rotated token revokes the whole family. */
  async refresh(rawToken: string | undefined, client: ClientInfo) {
    if (!rawToken) throw AppError.unauthenticated();
    const stored = await refreshTokenRepository.findByHash(hashRefreshToken(rawToken));
    if (!stored) throw AppError.unauthenticated();

    if (stored.revokedAt) {
      if (Date.now() - stored.revokedAt.getTime() > ROTATION_GRACE_MS) {
        await refreshTokenRepository.revokeFamily(stored.familyId);
      }
      throw AppError.unauthenticated();
    }
    if (stored.expiresAt <= new Date()) throw AppError.unauthenticated();

    const user = await userRepository.findById(stored.userId);
    if (!user || user.status !== "ACTIVE") {
      await refreshTokenRepository.revokeFamily(stored.familyId);
      throw AppError.unauthenticated();
    }

    // Only one concurrent caller wins the rotation.
    if (!(await refreshTokenRepository.revokeIfActive(stored.id))) {
      throw AppError.unauthenticated();
    }
    return issueSession(user, client, stored.familyId);
  },

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const stored = await refreshTokenRepository.findByHash(hashRefreshToken(rawToken));
    if (stored) await refreshTokenRepository.revokeFamily(stored.familyId);
  },

  async getCurrentUser(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== "ACTIVE") throw AppError.unauthenticated();
    return toAuthUser(user);
  },

  /** Revokes every session of a user and starts a fresh one (used after a password change). */
  async resetSessions(user: UserWithRole, client: ClientInfo) {
    await refreshTokenRepository.revokeAllForUser(user.id);
    return issueSession(user, client);
  },
};
