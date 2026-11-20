import { randomUUID } from "node:crypto";

import type { Role } from "@smartdine/shared";
import request from "supertest";

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { hashPassword } from "../../src/modules/auth/password";
import { syncRbac } from "../../src/modules/auth/rbac.sync";
import { REFRESH_COOKIE } from "../../src/modules/auth/refreshCookie";

export const PASSWORD = "Str0ngPassw0rd!";
export const EMAIL_PREFIX = "it-";
export const BRANCH_PREFIX = "IT";
export const app = createApp();

export const uniqueEmail = (label = "user") => `${EMAIL_PREFIX}${label}-${randomUUID()}@test.dev`;

export async function setupDatabase() {
  await syncRbac(prisma);
  if (!(await prisma.company.findFirst({ where: { deletedAt: null } }))) {
    await prisma.company.create({ data: { name: "SmartDine" } });
  }
}

export async function cleanupUsers() {
  // Audit entries keep the actor only softly; clear the test ones so they don't pile up.
  await prisma.auditLog.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
  // Bills (and their payments / refunds / receipts) pin both the order and the cashier.
  await prisma.bill.deleteMany({
    where: {
      OR: [
        { order: { waiter: { email: { startsWith: EMAIL_PREFIX } } } },
        { payments: { some: { cashier: { email: { startsWith: EMAIL_PREFIX } } } } },
      ],
    },
  });
  // Orders hold their waiter with RESTRICT; they go first (items and history cascade).
  await prisma.order.deleteMany({ where: { waiter: { email: { startsWith: EMAIL_PREFIX } } } });
  // Stock history keeps the user only softly (SET NULL), so no extra cleanup is needed here.
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

/** Removes test branches and everything under them (tables first: areas are RESTRICTed by tables). */
export async function cleanupBranches() {
  const where = { branch: { code: { startsWith: BRANCH_PREFIX } } };
  const branches = await prisma.branch.findMany({
    where: { code: { startsWith: BRANCH_PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { branchId: { in: branches.map((b) => b.id) } } });
  // Reservations first: their table / room links are SET NULL, which the target check forbids.
  await prisma.bill.deleteMany({ where });
  await prisma.stockTransaction.deleteMany({ where });
  await prisma.inventoryItem.deleteMany({ where });
  await prisma.order.deleteMany({ where });
  await prisma.restaurantReservation.deleteMany({ where });
  // Accommodation: bookings and tasks reference rooms / types with RESTRICT, so go child-first.
  await prisma.roomBooking.deleteMany({ where });
  await prisma.housekeepingTask.deleteMany({ where });
  await prisma.room.deleteMany({ where });
  await prisma.roomType.deleteMany({ where });
  await prisma.restaurantTable.deleteMany({ where });
  await prisma.branch.deleteMany({ where: { code: { startsWith: BRANCH_PREFIX } } });
}

export async function cleanupShifts() {
  await prisma.shift.deleteMany({ where: { name: { startsWith: "IT " } } });
}

export const ALL_DAYS_OPEN = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
    d,
    { open: "10:00", close: "22:00" },
  ]),
);

/** Remaining menu test data (items go with their branch; categories are company-wide). */
export async function cleanupMenu() {
  await prisma.menuCategory.deleteMany({ where: { name: { startsWith: "IT " } } });
}

/** A calendar date `days` ahead, as YYYY-MM-DD (noon-safe for any timezone). */
export function futureDate(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function createBranch(
  label = "A",
  extra: { openingHours?: object; timezone?: string; status?: "OPEN" | "CLOSED" } = {},
) {
  const company = await prisma.company.findFirstOrThrow({ where: { deletedAt: null } });
  return prisma.branch.create({
    data: {
      ...extra,
      companyId: company.id,
      name: `IT Branch ${label}`,
      code: `${BRANCH_PREFIX}${label}${randomUUID().slice(0, 5).toUpperCase()}`,
    },
  });
}

export async function createUser(
  role: Role,
  overrides: { status?: "ACTIVE" | "DISABLED"; branchId?: string } = {},
) {
  const email = uniqueEmail(role.toLowerCase());
  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      firstName: "Test",
      lastName: role,
      status: overrides.status,
      branch: overrides.branchId ? { connect: { id: overrides.branchId } } : undefined,
      role: { connect: { name: role } },
    },
  });
  return email;
}

export function refreshCookieOf(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const entry = cookies.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`));
  return entry?.split(";")[0]; // "sd_refresh=<token>"
}

export async function login(email: string, password = PASSWORD) {
  const res = await request(app).post("/api/v2/auth/login").send({ email, password });
  return {
    res,
    accessToken: res.body.data?.accessToken as string | undefined,
    cookie: refreshCookieOf(res),
  };
}

export const bearer = (token: string | undefined) => ({ Authorization: `Bearer ${token}` });

/** Creates a user, signs in, and returns what tests need to act as them. */
export async function actor(role: Role, branchId?: string) {
  const email = await createUser(role, { branchId });
  const { accessToken, res } = await login(email);
  return { email, token: accessToken!, userId: res.body.data.user.id as string };
}

export { prisma, request };
