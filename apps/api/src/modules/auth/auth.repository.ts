import { prisma } from "../../config/database";

export const refreshTokenRepository = {
  create: (data: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }) => prisma.refreshToken.create({ data }),

  findByHash: (tokenHash: string) => prisma.refreshToken.findUnique({ where: { tokenHash } }),

  /** Atomically revokes a still-active token; returns false if someone else already did. */
  async revokeIfActive(id: string): Promise<boolean> {
    const { count } = await prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count === 1;
  },

  revokeFamily: (familyId: string) =>
    prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),

  revokeAllForUser: (userId: string) =>
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
};
