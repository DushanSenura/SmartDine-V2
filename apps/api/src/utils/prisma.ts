import { Prisma } from "@prisma/client";

import { prisma } from "../config/database";

/** Maps `null` to Prisma's DB-null marker for nullable JSON columns; leaves `undefined` untouched. */
export function jsonOrNull(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  return value === null ? Prisma.DbNull : value;
}

/** True when `error` is a Prisma unique-constraint violation, optionally on a given field. */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  if (!field) return true;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field);
}

export const toNumber = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : Number(value);

/**
 * Postgres aborts one side of concurrent conflicting writes with a deadlock (40P01) or
 * serialization failure (40001). The write is safe to retry: the winner's row is then visible and
 * the retry resolves into a normal conflict.
 */
export function isTransientConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /40P01|40001|deadlock detected|could not serialize/i.test(message);
}

export const backoff = (attempt: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, 15 * (attempt + 1) + Math.random() * 40));

/**
 * Runs `fn` in a transaction that first takes a transaction-scoped advisory lock on `resourceId`.
 * Concurrent bookings of the same table / room therefore queue up instead of racing: the exclusion
 * constraint would reject the loser anyway, but two in-flight overlapping inserts wait on each
 * other until Postgres' deadlock detector (≥1 s) aborts one. The lock makes the loser fail fast and
 * cleanly; the constraint remains the safety net.
 */
export function withResourceLock<T>(
  resourceId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resourceId}))`;
    return fn(tx);
  });
}

/**
 * Like `withResourceLock`, for operations touching several resources at once (a stock transfer).
 * Locks are always taken in sorted order, so two overlapping operations can never deadlock.
 */
export function withResourceLocks<T>(
  resourceIds: string[],
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    for (const id of [...new Set(resourceIds)].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    }
    return fn(tx);
  });
}

/**
 * Prisma's `contains` hands `%` and `_` to SQL LIKE as wildcards, so a search for "%%" matches
 * everything. Escape them so what a person types is searched for literally.
 */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
