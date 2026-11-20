import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  actor,
  cleanupBranches,
  cleanupMenu,
  cleanupUsers,
  prisma,
  setupDatabase,
} from "./helpers";
import { api, attach, openBill, payCash, pinRates, pointsOf, restaurant } from "./fixtures";

let restoreRates: () => Promise<void>;

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  restoreRates = await pinRates(true);
});
// A running multiplier would change the points every later test earns.
afterEach(async () => {
  await prisma.promotion.deleteMany({ where: { name: { startsWith: "IT " } } });
});
afterAll(async () => {
  await prisma.promotion.deleteMany({ where: { name: { startsWith: "IT " } } });
  await restoreRates();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});

const redeem = (token: string, billId: string, points: number) =>
  api("post", `/bills/${billId}/redeem`, token).send({ points });

describe("earning points", () => {
  it("earns whole points on what the customer paid, and shows them on the bill and the account", async () => {
    const w = await restaurant("L1");
    const customer = await actor("CUSTOMER");
    const { bill } = await openBill(w, [w.burger.id]); // 1155.00
    const attached = await attach(w, bill.id, customer.userId);
    expect(attached.body.data.customer).toMatchObject({ id: customer.userId, points: 0 });

    const paid = await payCash(w, bill.id, bill.total);
    expect(paid.body.data).toMatchObject({ status: "PAID", pointsEarned: 11 }); // floor(1155 / 100)
    expect(await pointsOf(customer.userId)).toBe(11);

    const account = await api("get", "/customers/me/loyalty", customer.token);
    expect(account.body.data).toMatchObject({
      enabled: true,
      points: 11,
      lifetimePoints: 11,
      currencyPerPoint: 100,
      pointValue: 1,
    });
    expect(account.body.data.transactions[0]).toMatchObject({
      type: "EARN",
      points: 11,
      balanceAfter: 11,
    });
  });

  it("earns nothing when loyalty is off or no customer is attached", async () => {
    const w = await restaurant("L2");
    const customer = await actor("CUSTOMER");
    const noCustomer = (await openBill(w, [w.soup.id], 0)).bill;
    await payCash(w, noCustomer.id, noCustomer.total);

    const off = (await openBill(w, [w.soup.id], 1)).bill;
    await attach(w, off.id, customer.userId);
    await prisma.companySettings.updateMany({ data: { loyaltyEnabled: false } });
    await payCash(w, off.id, off.total);
    await prisma.companySettings.updateMany({ data: { loyaltyEnabled: true } });
    expect(await pointsOf(customer.userId)).toBe(0);
  });

  it("applies the best running points multiplier", async () => {
    const w = await restaurant("L3");
    const owner = await actor("OWNER");
    const customer = await actor("CUSTOMER");
    await api("post", "/promotions", owner.token)
      .send({ name: "IT Double points", type: "LOYALTY_MULTIPLIER", value: 2 })
      .expect(201);
    await api("post", "/promotions", owner.token)
      .send({
        name: "IT Triple (expired)",
        type: "LOYALTY_MULTIPLIER",
        value: 3,
        endsOn: "2020-01-01",
      })
      .expect(201);
    const { bill } = await openBill(w, [w.burger.id]);
    await attach(w, bill.id, customer.userId);
    const paid = await payCash(w, bill.id, bill.total);
    expect(paid.body.data.pointsEarned).toBe(22); // 11 × 2; the expired 3× is ignored
    const note = (await api("get", "/customers/me/loyalty", customer.token)).body.data
      .transactions[0].note;
    expect(note).toContain("2x");
  });
});

describe("redeeming points", () => {
  it("pays part of a bill with points, then the rest in cash, earning only on the cash", async () => {
    const w = await restaurant("R1");
    const customer = await actor("CUSTOMER");
    await api("post", `/customers/${customer.userId}/loyalty`, (await actor("OWNER")).token)
      .send({ points: 300, note: "Welcome bonus" })
      .expect(201);

    const { bill } = await openBill(w, [w.burger.id]); // 1155
    const noCustomer = await redeem(w.cashier.token, bill.id, 100);
    expect(noCustomer.body.error.code).toBe("NO_CUSTOMER");

    const withCustomer = await attach(w, bill.id, customer.userId);
    expect(withCustomer.body.data.loyalty).toMatchObject({
      enabled: true,
      maxRedeemablePoints: 300,
    });

    const partial = await redeem(w.cashier.token, bill.id, 200);
    expect(partial.status).toBe(201);
    expect(partial.body.data).toMatchObject({ paidAmount: 200, balance: 955, status: "OPEN" });
    expect(partial.body.data.payments[0]).toMatchObject({
      method: "LOYALTY_POINTS",
      amount: 200,
      reference: "200 pts",
    });
    expect(await pointsOf(customer.userId)).toBe(100);

    const done = await payCash(w, bill.id, 955);
    expect(done.body.data.status).toBe("PAID");
    // 955 of real money → 9 points; the 200 spent in points earns nothing.
    expect(done.body.data.pointsEarned).toBe(9);
    expect(await pointsOf(customer.userId)).toBe(109);

    // Points are a tender, not takings: they're listed by method but aren't money collected.
    const summary = (await api("get", `/payments/summary?branchId=${w.branch.id}`, w.cashier.token))
      .body.data;
    expect(summary.collected).toBe(955);
    expect(summary.byMethod.map((m: { method: string }) => m.method).sort()).toEqual([
      "CASH",
      "LOYALTY_POINTS",
    ]);
  });

  it("refuses more points than the customer holds or the bill needs", async () => {
    const w = await restaurant("R2");
    const customer = await actor("CUSTOMER");
    await api("post", `/customers/${customer.userId}/loyalty`, (await actor("OWNER")).token)
      .send({ points: 50, note: "Seed" })
      .expect(201);
    const { bill } = await openBill(w, [w.soup.id]); // 577.50
    await attach(w, bill.id, customer.userId);
    expect((await redeem(w.cashier.token, bill.id, 51)).body.error.code).toBe(
      "INSUFFICIENT_POINTS",
    );
    expect((await redeem(w.cashier.token, bill.id, 0)).status).toBe(400);
    expect(await pointsOf(customer.userId)).toBe(50);

    await prisma.companySettings.updateMany({ data: { loyaltyEnabled: false } });
    const off = await redeem(w.cashier.token, bill.id, 10);
    await prisma.companySettings.updateMany({ data: { loyaltyEnabled: true } });
    expect(off.body.error.code).toBe("LOYALTY_DISABLED");
  });

  it("can't be used to pay through the ordinary payment endpoint", async () => {
    const w = await restaurant("R3");
    const { bill } = await openBill(w, [w.soup.id]);
    const res = await api("post", `/bills/${bill.id}/payments`, w.cashier.token).send({
      method: "LOYALTY_POINTS",
      amount: 10,
    });
    expect(res.status).toBe(400);
  });

  it("never spends the same points twice when two bills redeem at once", async () => {
    const w = await restaurant("R4");
    const customer = await actor("CUSTOMER");
    await api("post", `/customers/${customer.userId}/loyalty`, (await actor("OWNER")).token)
      .send({ points: 300, note: "Seed" })
      .expect(201);
    const a = (await openBill(w, [w.burger.id], 0)).bill;
    const b = (await openBill(w, [w.burger.id], 1)).bill;
    await attach(w, a.id, customer.userId);
    await attach(w, b.id, customer.userId);

    const results = await Promise.all([
      redeem(w.cashier.token, a.id, 200),
      redeem(w.cashier.token, b.id, 200),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await pointsOf(customer.userId)).toBe(100);
    const ledger = await prisma.loyaltyTransaction.aggregate({
      where: { account: { userId: customer.userId } },
      _sum: { points: true },
    });
    expect(ledger._sum.points).toBe(100); // the ledger always adds up to the balance
  });
});

describe("refunds and adjustments", () => {
  it("gives points back with a refund of the points payment and takes back earned points on a full refund", async () => {
    const w = await restaurant("F1");
    const customer = await actor("CUSTOMER");
    await api("post", `/customers/${customer.userId}/loyalty`, (await actor("OWNER")).token)
      .send({ points: 100, note: "Seed" })
      .expect(201);
    const { bill } = await openBill(w, [w.soup.id]); // 577.50
    await attach(w, bill.id, customer.userId);
    await redeem(w.cashier.token, bill.id, 100); // 100 points → 100.00
    const paid = (await payCash(w, bill.id, 477.5)).body.data;
    expect(paid.pointsEarned).toBe(4); // floor(477.5 / 100)
    expect(await pointsOf(customer.userId)).toBe(4);

    const pointsPayment = paid.payments.find(
      (p: { method: string }) => p.method === "LOYALTY_POINTS",
    );
    const cashPayment = paid.payments.find((p: { method: string }) => p.method === "CASH");
    await api("post", `/payments/${pointsPayment.id}/refund`, w.cashier.token)
      .send({ amount: 100, reason: "Wrong order" })
      .expect(201);
    expect(await pointsOf(customer.userId)).toBe(104); // the 100 spent points came back

    const full = await api("post", `/payments/${cashPayment.id}/refund`, w.cashier.token)
      .send({ amount: 477.5, reason: "Wrong order" })
      .expect(201);
    expect(full.body.data.status).toBe("REFUNDED");
    expect(await pointsOf(customer.userId)).toBe(100); // the 4 earned points were taken back
  });

  it("adjusts points by hand with a reason, and refuses to go below zero", async () => {
    const owner = await actor("OWNER");
    const manager = await actor("MANAGER");
    const waiter = await actor("WAITER");
    const customer = await actor("CUSTOMER");
    const adjust = (token: string, body: object) =>
      api("post", `/customers/${customer.userId}/loyalty`, token).send(body);

    expect(
      (await adjust(manager.token, { points: 40, note: "Birthday treat" })).body.data.points,
    ).toBe(40);
    expect((await adjust(owner.token, { points: -15, note: "Correction" })).body.data.points).toBe(
      25,
    );
    expect((await adjust(owner.token, { points: -26, note: "Too much" })).body.error.code).toBe(
      "INSUFFICIENT_POINTS",
    );
    expect((await adjust(owner.token, { points: 5, note: "" })).status).toBe(400);
    expect((await adjust(owner.token, { points: 0, note: "Nothing" })).status).toBe(400);
    expect((await adjust(waiter.token, { points: 5, note: "Not allowed" })).status).toBe(403);
    expect((await adjust(customer.token, { points: 500, note: "Self service" })).status).toBe(403);
    expect(await pointsOf(customer.userId)).toBe(25);
  });
});
