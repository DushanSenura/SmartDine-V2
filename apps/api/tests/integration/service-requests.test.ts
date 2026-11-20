import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupBranches, cleanupUsers, prisma, setupDatabase } from "./helpers";
import { api, eventually, inbox, restaurant } from "./fixtures";

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
});
afterAll(async () => {
  await cleanupUsers();
  await cleanupBranches();
  await prisma.$disconnect();
});

describe("guest service requests", () => {
  it("logs a request, tells the floor once, and clears it when resolved", async () => {
    const w = await restaurant("SR1");
    const tableId = w.tables[0]!.id;

    const first = await api("post", "/service-requests", w.manager.token)
      .send({ tableId, type: "WATER", note: "Still, no ice" })
      .expect(201);
    expect(first.body.data).toMatchObject({
      tableNumber: "1",
      type: "WATER",
      status: "OPEN",
      note: "Still, no ice",
    });

    // Asking again for the same thing doesn't page the waiter twice.
    const again = await api("post", "/service-requests", w.manager.token)
      .send({ tableId, type: "WATER" })
      .expect(201);
    expect(again.body.data.id).toBe(first.body.data.id);

    const heard = await eventually(
      () => inbox(w.waiter.token),
      (b) => b.notifications.length > 0,
    );
    expect(heard.notifications).toHaveLength(1);
    expect(heard.notifications[0]).toMatchObject({
      type: "SERVICE_REQUESTED",
      title: "Table 1: Water",
    });

    const open = await api("get", `/service-requests?branchId=${w.branch.id}`, w.waiter.token);
    expect(open.body.data).toHaveLength(1);

    await api("post", `/service-requests/${first.body.data.id}/resolve`, w.waiter.token).expect(
      200,
    );
    const after = await api("get", `/service-requests?branchId=${w.branch.id}`, w.waiter.token);
    expect(after.body.data).toEqual([]);
  });

  it("keeps requests inside their branch and out of reach of the kitchen and cashier", async () => {
    const w = await restaurant("SR2");
    const elsewhere = await restaurant("SR2b");
    const tableId = w.tables[0]!.id;
    const made = await api("post", "/service-requests", w.waiter.token)
      .send({ tableId, type: "ASSISTANCE" })
      .expect(201);

    await api("post", "/service-requests", elsewhere.waiter.token)
      .send({ tableId, type: "BILL" })
      .expect(403);
    await api(
      "post",
      `/service-requests/${made.body.data.id}/resolve`,
      elsewhere.waiter.token,
    ).expect(403);
    await api("get", `/service-requests?branchId=${w.branch.id}`, elsewhere.waiter.token).expect(
      403,
    );
    await api("get", `/service-requests?branchId=${w.branch.id}`, w.kitchen.token).expect(403);
    await api("post", "/service-requests", w.cashier.token)
      .send({ tableId, type: "WATER" })
      .expect(403);
    await api("post", "/service-requests", undefined).send({ tableId, type: "WATER" }).expect(401);
  });
});
