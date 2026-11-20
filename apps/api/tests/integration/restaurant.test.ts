import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PASSWORD,
  actor,
  app,
  bearer,
  cleanupBranches,
  cleanupShifts,
  cleanupUsers,
  createBranch,
  login,
  prisma,
  request,
  setupDatabase,
  uniqueEmail,
} from "./helpers";

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
});
afterAll(async () => {
  await cleanupUsers();
  await cleanupBranches();
  await cleanupShifts();
  await prisma.$disconnect();
});

const api = (method: "get" | "post" | "put" | "patch" | "delete", path: string, token: string) =>
  request(app)[method](`/api/v2${path}`).set(bearer(token));

const newBranchBody = (code: string) => ({ name: "IT Created", code, city: "Colombo" });

describe("branches", () => {
  it("lets only the owner create, update and delete branches", async () => {
    const owner = await actor("OWNER");
    const code = `IT${Date.now().toString(36).slice(-6)}`.toUpperCase();

    const created = await api("post", "/branches", owner.token).send(newBranchBody(code));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code, status: "OPEN" });

    const dup = await api("post", "/branches", owner.token).send(newBranchBody(code));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("BRANCH_CODE_TAKEN");

    const updated = await api("patch", `/branches/${created.body.data.id}`, owner.token).send({
      status: "MAINTENANCE",
      openingHours: { mon: { open: "09:00", close: "22:00" }, sun: null },
    });
    expect(updated.body.data.status).toBe("MAINTENANCE");
    expect(updated.body.data.openingHours.sun).toBeNull();

    for (const role of ["MANAGER", "WAITER", "KITCHEN", "CASHIER", "CUSTOMER"] as const) {
      const other = await actor(role);
      await api("post", "/branches", other.token).send(newBranchBody("ITNOPE")).expect(403);
    }
    await request(app).post("/api/v2/branches").send(newBranchBody("ITNOPE")).expect(401);

    await api("delete", `/branches/${created.body.data.id}`, owner.token).expect(200);
    await api("get", `/branches/${created.body.data.id}`, owner.token).expect(404);
  });

  it("makes the assigned manager a member of the branch and removes the previous one", async () => {
    const owner = await actor("OWNER");
    const branch = await createBranch("M");
    const first = await actor("MANAGER");
    const second = await actor("MANAGER");

    await api("patch", `/branches/${branch.id}`, owner.token).send({ managerId: first.userId });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.userId } })).branchId).toBe(
      branch.id,
    );

    await api("patch", `/branches/${branch.id}`, owner.token).send({ managerId: second.userId });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: first.userId } })).branchId,
    ).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: second.userId } })).branchId).toBe(
      branch.id,
    );

    // Only a MANAGER can be assigned as manager.
    const waiter = await actor("WAITER");
    await api("patch", `/branches/${branch.id}`, owner.token)
      .send({ managerId: waiter.userId })
      .expect(400);
  });
});

describe("branch isolation (IDOR)", () => {
  it("confines non-owner staff to their own branch", async () => {
    const [a, b] = [await createBranch("A"), await createBranch("B")];
    const owner = await actor("OWNER");
    const managerA = await actor("MANAGER", a.id);
    const waiterA = await actor("WAITER", a.id);

    const area = await api("post", "/tables/areas", owner.token).send({
      branchId: b.id,
      name: "Hall",
    });
    const table = await api("post", "/tables", owner.token).send({
      branchId: b.id,
      diningAreaId: area.body.data.id,
      tableNumber: "1",
      capacity: 4,
    });
    expect(table.status).toBe(201);

    // Branch list shows only their own branch.
    const mine = await api("get", "/branches", managerA.token);
    expect(mine.body.data.map((x: { id: string }) => x.id)).toEqual([a.id]);
    await api("get", `/branches/${b.id}`, managerA.token).expect(403);

    // Reads and writes against branch B are refused.
    await api("get", `/tables?branchId=${b.id}`, managerA.token).expect(403);
    await api("get", `/tables?branchId=${b.id}`, waiterA.token).expect(403);
    await api("patch", `/tables/${table.body.data.id}`, managerA.token)
      .send({ capacity: 9 })
      .expect(403);
    await api("delete", `/tables/${table.body.data.id}`, managerA.token).expect(403);
    await api("patch", `/tables/${table.body.data.id}/status`, waiterA.token)
      .send({ status: "OCCUPIED" })
      .expect(403);
    await api("post", "/tables", managerA.token)
      .send({ branchId: b.id, diningAreaId: area.body.data.id, tableNumber: "9", capacity: 2 })
      .expect(403);
    await api("get", `/staff?branchId=${b.id}`, managerA.token).expect(403);

    // Omitting branchId resolves to the caller's own branch.
    const own = await api("get", "/tables", managerA.token);
    expect(own.status).toBe(200);
    expect(own.body.data).toEqual([]);
  });
});

describe("staff management", () => {
  it("creates staff with an HR profile and enforces role and branch limits", async () => {
    const [a, b] = [await createBranch("S1"), await createBranch("S2")];
    const manager = await actor("MANAGER", a.id);
    const owner = await actor("OWNER");
    const body = (role: string, branchId: string) => ({
      email: uniqueEmail("hire"),
      password: PASSWORD,
      firstName: "Nina",
      lastName: "Hire",
      role,
      branchId,
      department: "Service",
      hireDate: "2026-01-15",
      emergencyContactName: "Sam",
      emergencyContactPhone: "+94 77 123 4567",
    });

    const created = await api("post", "/staff", manager.token).send(body("WAITER", a.id));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      role: "WAITER",
      branchId: a.id,
      department: "Service",
      hireDate: "2026-01-15",
      employmentStatus: "ACTIVE",
    });
    expect(created.body.data.employeeId).toMatch(/^EMP-/);
    expect(created.body.data.passwordHash).toBeUndefined();

    await api("post", "/staff", manager.token).send(body("WAITER", b.id)).expect(403);
    await api("post", "/staff", manager.token).send(body("MANAGER", a.id)).expect(403);
    await api("post", "/staff", manager.token).send(body("OWNER", a.id)).expect(403);
    await api("post", "/staff", owner.token).send(body("MANAGER", b.id)).expect(201);

    const dupId = { ...body("CASHIER", a.id), employeeId: created.body.data.employeeId };
    const dup = await api("post", "/staff", manager.token).send(dupId);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMPLOYEE_ID_TAKEN");
  });

  it("hides other branches' staff and managers from a manager, and blocks floor staff entirely", async () => {
    const [a, b] = [await createBranch("S3"), await createBranch("S4")];
    const manager = await actor("MANAGER", a.id);
    const otherWaiter = await actor("WAITER", b.id);
    const peer = await actor("MANAGER", a.id);

    await api("get", `/staff/${otherWaiter.userId}`, manager.token).expect(403);
    await api("delete", `/staff/${otherWaiter.userId}`, manager.token).expect(403);
    // A manager cannot manage a fellow manager.
    await api("patch", `/staff/${peer.userId}`, manager.token).send({ firstName: "X" }).expect(403);

    const waiter = await actor("WAITER", a.id);
    await api("get", "/staff", waiter.token).expect(403);

    const list = await api("get", "/staff?pageSize=100", manager.token);
    expect(list.status).toBe(200);
    const roles = new Set(list.body.data.map((s: { role: string }) => s.role));
    expect(roles.has("MANAGER")).toBe(false);
    expect(list.body.data.every((s: { branchId: string }) => s.branchId === a.id)).toBe(true);
  });

  it("removing staff disables login, revokes sessions and frees their tables", async () => {
    const branch = await createBranch("S5");
    const manager = await actor("MANAGER", branch.id);
    const waiter = await actor("WAITER", branch.id);
    const area = await api("post", "/tables/areas", manager.token).send({
      branchId: branch.id,
      name: "Hall",
    });
    const table = await api("post", "/tables", manager.token).send({
      branchId: branch.id,
      diningAreaId: area.body.data.id,
      tableNumber: "1",
      capacity: 2,
      assignedWaiterId: waiter.userId,
    });
    expect(table.body.data.assignedWaiterId).toBe(waiter.userId);

    await api("delete", `/staff/${waiter.userId}`, manager.token).expect(200);

    expect((await login(waiter.email)).res.status).toBe(401);
    const tables = await api("get", "/tables", manager.token);
    expect(tables.body.data[0].assignedWaiterId).toBeNull();
    await api("delete", `/staff/${manager.userId}`, manager.token).expect(400); // not yourself
  });
});

describe("floor plan", () => {
  it("lets an owner build a complete floor: area, tables, layout and waiter assignment", async () => {
    const branch = await createBranch("F");
    const owner = await actor("OWNER");
    const waiter = await actor("WAITER", branch.id);

    const area = await api("post", "/tables/areas", owner.token).send({
      branchId: branch.id,
      name: "Terrace",
      floor: 2,
    });
    expect(area.status).toBe(201);
    expect(area.body.data).toMatchObject({ floor: 2, width: 1200, isActive: true });

    const make = (tableNumber: string, extra = {}) =>
      api("post", "/tables", owner.token).send({
        branchId: branch.id,
        diningAreaId: area.body.data.id,
        tableNumber,
        capacity: 4,
        ...extra,
      });
    const t1 = await make("1", { shape: "ROUND", section: "Patio" });
    const t2 = await make("2");
    expect(t1.body.data).toMatchObject({ shape: "ROUND", status: "AVAILABLE", section: "Patio" });

    const dup = await make("1");
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("TABLE_NUMBER_TAKEN");

    const layout = await api("put", "/tables/layout", owner.token).send({
      tables: [
        { id: t1.body.data.id, positionX: 200, positionY: 120, width: 120, height: 120 },
        { id: t2.body.data.id, positionX: 400, positionY: 120, width: 80, height: 160 },
      ],
    });
    expect(layout.status).toBe(200);
    const moved = layout.body.data.find((t: { id: string }) => t.id === t1.body.data.id);
    expect(moved).toMatchObject({ positionX: 200, positionY: 120, width: 120 });

    const assigned = await api("post", "/tables/assign-waiter", owner.token).send({
      tableIds: [t1.body.data.id, t2.body.data.id],
      waiterId: waiter.userId,
    });
    expect(
      assigned.body.data.every((t: { assignedWaiterName: string }) => t.assignedWaiterName),
    ).toBe(true);

    // A non-waiter, or a waiter from another branch, cannot be assigned.
    const otherBranch = await createBranch("F2");
    const stranger = await actor("WAITER", otherBranch.id);
    await api("post", "/tables/assign-waiter", owner.token)
      .send({ tableIds: [t1.body.data.id], waiterId: stranger.userId })
      .expect(400);

    // An area with tables cannot be deleted; a freed table number can be reused.
    await api("delete", `/tables/areas/${area.body.data.id}`, owner.token).expect(409);
    await api("delete", `/tables/${t2.body.data.id}`, owner.token).expect(200);
    await make("2").then((res) => expect(res.status).toBe(201));
  });

  it("lets a waiter update table status but not edit or delete tables", async () => {
    const branch = await createBranch("W");
    const manager = await actor("MANAGER", branch.id);
    const waiter = await actor("WAITER", branch.id);
    const area = await api("post", "/tables/areas", manager.token).send({
      branchId: branch.id,
      name: "Hall",
    });
    const table = await api("post", "/tables", manager.token).send({
      branchId: branch.id,
      diningAreaId: area.body.data.id,
      tableNumber: "7",
      capacity: 2,
    });
    const id = table.body.data.id;

    const status = await api("patch", `/tables/${id}/status`, waiter.token).send({
      status: "OCCUPIED",
    });
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe("OCCUPIED");
    await api("patch", `/tables/${id}/status`, waiter.token).send({ status: "BOGUS" }).expect(400);

    await api("patch", `/tables/${id}`, waiter.token).send({ capacity: 10 }).expect(403);
    await api("delete", `/tables/${id}`, waiter.token).expect(403);
    await api("post", "/tables/areas", waiter.token)
      .send({ branchId: branch.id, name: "X" })
      .expect(403);

    // Kitchen and cashier have no access to the floor at all.
    for (const role of ["KITCHEN", "CASHIER", "CUSTOMER"] as const) {
      const other = await actor(role, role === "CUSTOMER" ? undefined : branch.id);
      await api("get", `/tables?branchId=${branch.id}`, other.token).expect(403);
    }
  });
});

describe("private dining rooms", () => {
  it("validates guest limits and returns money as numbers", async () => {
    const branch = await createBranch("P");
    const manager = await actor("MANAGER", branch.id);
    const body = {
      branchId: branch.id,
      name: "Garden Room",
      capacity: 20,
      minimumGuests: 6,
      maximumGuests: 16,
      amenities: ["Projector", "Sound system"],
      minimumSpend: 50000,
      hourlyRate: 7500.5,
      deposit: 10000,
    };
    const created = await api("post", "/private-dining", manager.token).send(body);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      minimumSpend: 50000,
      hourlyRate: 7500.5,
      deposit: 10000,
    });

    await api("post", "/private-dining", manager.token)
      .send({ ...body, minimumGuests: 18 })
      .expect(400);
    await api("post", "/private-dining", manager.token)
      .send({ ...body, maximumGuests: 30 })
      .expect(400);
    await api("patch", `/private-dining/${created.body.data.id}`, manager.token)
      .send({ maximumGuests: 25 })
      .expect(400);

    const otherManager = await actor("MANAGER", (await createBranch("P2")).id);
    await api("patch", `/private-dining/${created.body.data.id}`, otherManager.token)
      .send({ name: "Hijacked" })
      .expect(403);
    await api("get", `/private-dining?branchId=${branch.id}`, otherManager.token).expect(403);
    await api("delete", `/private-dining/${created.body.data.id}`, manager.token).expect(200);
    const list = await api("get", "/private-dining", manager.token);
    expect(list.body.data).toHaveLength(0);
  });
});

describe("shifts, schedule and attendance", () => {
  it("schedules staff, rejects outsiders and tracks clock-in/out", async () => {
    const [a, b] = [await createBranch("H1"), await createBranch("H2")];
    const manager = await actor("MANAGER", a.id);
    const waiter = await actor("WAITER", a.id);
    const outsider = await actor("WAITER", b.id);

    const shift = await api("post", "/shifts", manager.token).send({
      name: `IT Morning ${Date.now()}`,
      startTime: "06:00",
      endTime: "14:00",
    });
    expect(shift.status).toBe(201);
    await api("post", "/shifts", manager.token)
      .send({ name: "IT bad", startTime: "25:00", endTime: "14:00" })
      .expect(400);

    const entry = (userId: string, extra = {}) => ({
      userId,
      branchId: a.id,
      date: "2026-12-01",
      shiftId: shift.body.data.id,
      dayOff: false,
      ...extra,
    });
    const scheduled = await api("put", "/shifts/schedule", manager.token).send(
      entry(waiter.userId),
    );
    expect(scheduled.status).toBe(200);

    // Same day again replaces the entry (one per person per day), e.g. with a day off.
    const off = await api("put", "/shifts/schedule", manager.token).send(
      entry(waiter.userId, { shiftId: null, dayOff: true }),
    );
    expect(off.body.data.id).toBe(scheduled.body.data.id);
    expect(off.body.data.dayOff).toBe(true);
    await api("put", "/shifts/schedule", manager.token)
      .send(entry(waiter.userId, { dayOff: true })) // shift AND day off
      .expect(400);
    await api("put", "/shifts/schedule", manager.token).send(entry(outsider.userId)).expect(400);

    const range = await api(
      "get",
      `/shifts/schedule?branchId=${a.id}&from=2026-12-01&to=2026-12-07`,
      manager.token,
    );
    expect(range.body.data).toHaveLength(1);
    await api(
      "get",
      `/shifts/schedule?branchId=${b.id}&from=2026-12-01&to=2026-12-07`,
      manager.token,
    ).expect(403);
    await api(
      "get",
      `/shifts/schedule?branchId=${a.id}&from=2026-01-01&to=2026-12-31`,
      manager.token,
    ).expect(400);
    await api("delete", `/shifts/${shift.body.data.id}`, manager.token).expect(200);

    // Clock in / out
    await api("post", "/shifts/attendance/clock-out", waiter.token).expect(409);
    const clockIn = await api("post", "/shifts/attendance/clock-in", waiter.token);
    expect(clockIn.status).toBe(201);
    await api("post", "/shifts/attendance/clock-in", waiter.token).expect(409);
    expect(
      (await api("get", "/shifts/attendance/me", waiter.token)).body.data.clockOutAt,
    ).toBeNull();
    const out = await api("post", "/shifts/attendance/clock-out", waiter.token);
    expect(out.body.data.clockOutAt).toBeTruthy();

    const today = new Date().toISOString().slice(0, 10);
    const roster = await api(
      "get",
      `/shifts/attendance?branchId=${a.id}&date=${today}`,
      manager.token,
    );
    expect(roster.body.data.some((r: { userId: string }) => r.userId === waiter.userId)).toBe(true);
    await api("get", `/shifts/attendance?branchId=${a.id}&date=${today}`, waiter.token).expect(403);
  });
});

describe("company settings", () => {
  it("is readable by managers and writable only by the owner", async () => {
    const owner = await actor("OWNER");
    const manager = await actor("MANAGER");
    const waiter = await actor("WAITER");

    const before = await api("get", "/settings", owner.token);
    expect(before.status).toBe(200);
    const original = before.body.data.settings;

    const updated = await api("put", "/settings", owner.token).send({
      settings: { taxRatePercent: 8.5, reservationDurationMinutes: 120 },
    });
    expect(updated.body.data.settings).toMatchObject({
      taxRatePercent: 8.5,
      reservationDurationMinutes: 120,
    });
    await api("put", "/settings", owner.token)
      .send({ settings: { taxRatePercent: 120 } })
      .expect(400);

    await api("get", "/settings", manager.token).expect(200);
    await api("put", "/settings", manager.token)
      .send({ settings: { taxRatePercent: 1 } })
      .expect(403);
    await api("get", "/settings", waiter.token).expect(403);

    await api("put", "/settings", owner.token).send({ settings: original }); // restore
  });
});
