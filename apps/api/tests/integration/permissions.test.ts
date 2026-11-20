import type { Role } from "@smartdine/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PASSWORD,
  app,
  bearer,
  cleanupUsers,
  createUser,
  login,
  prisma,
  request,
  setupDatabase,
  uniqueEmail,
} from "./helpers";

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
});
afterAll(async () => {
  await cleanupUsers();
  await prisma.$disconnect();
});

async function tokenFor(role: Role) {
  const { accessToken } = await login(await createUser(role));
  return accessToken;
}

const newStaff = (role: string) => ({
  email: uniqueEmail("staff"),
  password: PASSWORD,
  firstName: "New",
  lastName: "Hire",
  role,
});

describe("user administration permissions", () => {
  it("requires authentication", async () => {
    await request(app).get("/api/v2/users").expect(401);
    await request(app).post("/api/v2/users").send(newStaff("WAITER")).expect(401);
  });

  it.each(["CUSTOMER", "WAITER", "KITCHEN", "CASHIER"] as Role[])(
    "forbids %s from listing or creating users",
    async (role) => {
      const token = await tokenFor(role);
      await request(app).get("/api/v2/users").set(bearer(token)).expect(403);
      await request(app)
        .post("/api/v2/users")
        .set(bearer(token))
        .send(newStaff("WAITER"))
        .expect(403);
    },
  );

  it("lets a manager create floor staff but not managers or owners", async () => {
    const token = await tokenFor("MANAGER");
    for (const role of ["WAITER", "KITCHEN", "CASHIER"]) {
      const res = await request(app).post("/api/v2/users").set(bearer(token)).send(newStaff(role));
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe(role);
    }
    for (const role of ["MANAGER", "OWNER"]) {
      await request(app).post("/api/v2/users").set(bearer(token)).send(newStaff(role)).expect(403);
    }
  });

  it("never allows creating customer accounts through the staff endpoint", async () => {
    const token = await tokenFor("OWNER");
    const res = await request(app)
      .post("/api/v2/users")
      .set(bearer(token))
      .send(newStaff("CUSTOMER"));
    expect(res.status).toBe(400);
  });

  it("lets an owner create managers and see all users, while managers only see their reports", async () => {
    const ownerToken = await tokenFor("OWNER");
    const created = await request(app)
      .post("/api/v2/users")
      .set(bearer(ownerToken))
      .send(newStaff("MANAGER"));
    expect(created.status).toBe(201);

    const ownerList = await request(app).get("/api/v2/users?pageSize=100").set(bearer(ownerToken));
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.meta).toMatchObject({ page: 1 });
    const ownerRoles = new Set(ownerList.body.data.map((u: { role: string }) => u.role));
    expect(ownerRoles.has("MANAGER")).toBe(true);

    const managerToken = await tokenFor("MANAGER");
    const managerList = await request(app)
      .get("/api/v2/users?pageSize=100")
      .set(bearer(managerToken));
    const managerRoles = managerList.body.data.map((u: { role: string }) => u.role);
    expect(managerRoles.every((r: string) => ["WAITER", "KITCHEN", "CASHIER"].includes(r))).toBe(
      true,
    );
  });

  it("exposes the permission set for each role in the session", async () => {
    const { res } = await login(await createUser("CASHIER"));
    expect(res.body.data.user.permissions).toContain("payments:process");
    expect(res.body.data.user.permissions).not.toContain("menu:manage");
  });
});

describe("profile", () => {
  it("lets a user update only their own profile fields", async () => {
    const token = await tokenFor("CUSTOMER");
    const res = await request(app)
      .patch("/api/v2/users/me")
      .set(bearer(token))
      .send({ firstName: "Renamed", role: "OWNER" });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe("Renamed");
    expect(res.body.data.role).toBe("CUSTOMER");
  });
});
