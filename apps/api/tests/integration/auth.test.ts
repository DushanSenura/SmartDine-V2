import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PASSWORD,
  app,
  bearer,
  cleanupUsers,
  createUser,
  login,
  prisma,
  refreshCookieOf,
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

describe("registration", () => {
  it("creates a customer, sets an httpOnly strict refresh cookie and returns a session", async () => {
    const res = await request(app)
      .post("/api/v2/auth/register")
      .send({ email: uniqueEmail("reg"), password: PASSWORD, firstName: "Ada", lastName: "L" });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: "CUSTOMER", permissions: [] });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v2\/auth/);
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const email = uniqueEmail("dup");
    const body = { email, password: PASSWORD, firstName: "A", lastName: "B" };
    await request(app).post("/api/v2/auth/register").send(body).expect(201);
    const dup = await request(app).post("/api/v2/auth/register").send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");

    const weak = await request(app)
      .post("/api/v2/auth/register")
      .send({ ...body, email: uniqueEmail("weak"), password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("login and session", () => {
  it("logs in and returns the current user from /me", async () => {
    const email = await createUser("WAITER");
    const { res, accessToken } = await login(email);
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("WAITER");

    const me = await request(app).get("/api/v2/auth/me").set(bearer(accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);
  });

  it("gives the same generic error for unknown email and wrong password", async () => {
    const email = await createUser("CASHIER");
    const wrong = await login(email, "Wrong-Passw0rd!");
    const unknown = await login(uniqueEmail("ghost"));
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(wrong.res.body.error).toEqual(unknown.res.body.error);
  });

  it("blocks disabled accounts", async () => {
    const email = await createUser("KITCHEN", { status: "DISABLED" });
    const { res } = await login(email);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("rejects missing, malformed and tampered access tokens", async () => {
    const email = await createUser("MANAGER");
    const { accessToken } = await login(email);
    await request(app).get("/api/v2/auth/me").expect(401);
    await request(app).get("/api/v2/auth/me").set(bearer("garbage")).expect(401);
    await request(app)
      .get("/api/v2/auth/me")
      .set(bearer(`${accessToken}x`))
      .expect(401);
  });
});

describe("refresh tokens", () => {
  it("rotates the refresh token and rejects the old one", async () => {
    const { cookie } = await login(await createUser("WAITER"));
    const refreshed = await request(app).post("/api/v2/auth/refresh").set("Cookie", cookie!);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();
    const next = refreshCookieOf(refreshed);
    expect(next).toBeTruthy();
    expect(next).not.toBe(cookie);

    const replay = await request(app).post("/api/v2/auth/refresh").set("Cookie", cookie!);
    expect(replay.status).toBe(401);
  });

  it("revokes the whole token family when a rotated token is replayed after the grace window", async () => {
    const { cookie } = await login(await createUser("WAITER"));
    const rotated = await request(app).post("/api/v2/auth/refresh").set("Cookie", cookie!);
    const newest = refreshCookieOf(rotated)!;

    // Age the revocation of the original token beyond the grace period.
    await prisma.refreshToken.updateMany({
      where: { revokedAt: { not: null }, user: { email: { startsWith: "it-" } } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    await request(app).post("/api/v2/auth/refresh").set("Cookie", cookie!).expect(401);
    // The legitimate newest token is now dead too: theft is assumed.
    await request(app).post("/api/v2/auth/refresh").set("Cookie", newest).expect(401);
  });

  it("refuses refresh requests from untrusted origins and without a cookie", async () => {
    const { cookie } = await login(await createUser("WAITER"));
    await request(app)
      .post("/api/v2/auth/refresh")
      .set("Cookie", cookie!)
      .set("Origin", "https://evil.example")
      .expect(403);
    await request(app).post("/api/v2/auth/refresh").expect(401);
  });

  it("logout invalidates the refresh token", async () => {
    const { cookie } = await login(await createUser("CASHIER"));
    await request(app).post("/api/v2/auth/logout").set("Cookie", cookie!).expect(200);
    await request(app).post("/api/v2/auth/refresh").set("Cookie", cookie!).expect(401);
  });
});

describe("password change", () => {
  it("requires the current password, then signs out other sessions", async () => {
    const email = await createUser("MANAGER");
    const first = await login(email);
    const second = await login(email);
    const newPassword = "An0therStr0ngPass!";

    await request(app)
      .post("/api/v2/users/me/password")
      .set(bearer(first.accessToken))
      .send({ currentPassword: "nope-nope-Nope1", newPassword })
      .expect(400);

    const changed = await request(app)
      .post("/api/v2/users/me/password")
      .set(bearer(first.accessToken))
      .send({ currentPassword: PASSWORD, newPassword });
    expect(changed.status).toBe(200);
    expect(refreshCookieOf(changed)).toBeTruthy();

    await request(app).post("/api/v2/auth/refresh").set("Cookie", second.cookie!).expect(401);
    expect((await login(email, PASSWORD)).res.status).toBe(401);
    expect((await login(email, newPassword)).res.status).toBe(200);
  });
});
