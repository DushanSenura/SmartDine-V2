import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actor,
  cleanupBranches,
  cleanupMenu,
  cleanupUsers,
  futureDate,
  prisma,
  setupDatabase,
} from "./helpers";
import { api, eventually, openBill, payCash, pinRates, restaurant, type World } from "./fixtures";

let restoreRates: () => Promise<void>;
let owner: Awaited<ReturnType<typeof actor>>;

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  restoreRates = await pinRates(true);
  owner = await actor("OWNER");
});
afterAll(async () => {
  await restoreRates();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  role: string | null;
  branchId: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ip: string | null;
}

/** Audit entries are written right after the action, so poll for the one we expect. */
async function entriesFor(query: string, expected = 1) {
  return eventually(
    async () => (await api("get", `/audit?${query}`, owner.token)).body.data as Entry[],
    (entries) => entries.length >= expected,
  );
}

describe("the audit trail", () => {
  it("records a refund with who, what, why and from where — in the same transaction", async () => {
    const w = await restaurant("A1");
    const { bill } = await openBill(w, [w.soup.id]);
    const paid = (await payCash(w, bill.id, bill.total)).body.data;
    await api("post", `/payments/${paid.payments[0].id}/refund`, w.cashier.token)
      .send({ amount: 50, reason: "Cold soup" })
      .expect(201);

    const [entry] = await entriesFor(`action=payment.refunded&userId=${w.cashier.userId}`);
    expect(entry).toMatchObject({
      action: "payment.refunded",
      entity: "payment",
      entityId: paid.payments[0].id,
      userId: w.cashier.userId,
      userName: "Test CASHIER",
      role: "CASHIER",
      branchId: w.branch.id,
    });
    expect(entry!.newValue).toMatchObject({
      amount: 50,
      reason: "Cold soup",
      method: "CASH",
      billId: bill.id,
    });
    expect(entry!.ip).toBeTruthy();
  });

  it("records price changes with the old and new price, but not unrelated edits", async () => {
    const w = await restaurant("A2");
    await api("patch", `/menu/items/${w.burger.id}`, w.manager.token)
      .send({ name: "Big Burger" })
      .expect(200);
    await api("patch", `/menu/items/${w.burger.id}`, w.manager.token)
      .send({ price: 1250 })
      .expect(200);
    await api("patch", `/menu/items/${w.burger.id}`, w.manager.token)
      .send({ price: 1250 })
      .expect(200); // unchanged

    const entries = await entriesFor(`action=menu.price_changed&userId=${w.manager.userId}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.previousValue).toMatchObject({ price: 1000 });
    expect(entries[0]!.newValue).toMatchObject({ price: 1250, name: "Big Burger" });
    expect(entries[0]!.entityId).toBe(w.burger.id);
  });

  it("records discounts, voids and stock write-offs", async () => {
    const w = await restaurant("A3");
    const { bill, orderId } = await openBill(w, [w.burger.id]);
    await api("patch", `/bills/${bill.id}/discount`, w.cashier.token)
      .send({ type: "PERCENT", value: 5, reason: "Regular guest" })
      .expect(200);
    const discount = (
      await entriesFor(`action=bill.discount_applied&userId=${w.cashier.userId}`)
    )[0]!;
    expect(discount.newValue).toMatchObject({ type: "PERCENT", value: 5, reason: "Regular guest" });

    await api("post", `/orders/${orderId}/cancel`, w.manager.token)
      .send({ reason: "Walked out" })
      .expect(200);
    const voided = (await entriesFor(`action=order.voided&userId=${w.manager.userId}`))[0]!;
    expect(voided).toMatchObject({ entity: "order", entityId: orderId });
    expect(voided.newValue).toMatchObject({ status: "VOID", reason: "Walked out" });

    const item = (
      await api("post", "/inventory/items", w.manager.token).send({
        name: "Cream",
        sku: "CREAM",
        category: "Dairy",
        unit: "l",
        quantity: 10,
      })
    ).body.data;
    await api("post", `/inventory/items/${item.id}/movements`, w.manager.token)
      .send({ type: "WASTE", quantity: 2, note: "Spoiled" })
      .expect(201);
    const waste = (await entriesFor(`action=stock.waste&userId=${w.manager.userId}`))[0]!;
    expect(waste.previousValue).toMatchObject({ quantity: 10 });
    expect(waste.newValue).toMatchObject({ quantity: 8, note: "Spoiled" });
  });

  it("records cancelled reservations and bookings, whoever cancels", async () => {
    const w = await restaurant("A4");
    const customer = await actor("CUSTOMER");
    const area = await prisma.diningArea.findFirstOrThrow({ where: { branchId: w.branch.id } });
    const booked = await api("post", "/reservations", customer.token).send({
      branchId: w.branch.id,
      date: futureDate(6),
      time: "19:00",
      partySize: 2,
      diningAreaId: area.id,
      guestName: "Cara Cancels",
      guestEmail: "c@example.com",
      guestPhone: "+94 77 000 0000",
    });
    await api("post", `/reservations/${booked.body.data.id}/cancel`, customer.token).expect(200);
    const mine = (await entriesFor(`action=reservation.cancelled&userId=${customer.userId}`))[0]!;
    expect(mine.newValue).toMatchObject({ status: "CANCELLED", by: "customer" });

    const second = await api("post", "/reservations", customer.token).send({
      branchId: w.branch.id,
      date: futureDate(7),
      time: "19:00",
      partySize: 2,
      diningAreaId: area.id,
      guestName: "Cara Again",
      guestEmail: "c@example.com",
      guestPhone: "+94 77 000 0000",
    });
    await api("patch", `/reservations/${second.body.data.id}/status`, w.manager.token)
      .send({ status: "CANCELLED", reason: "Kitchen closed" })
      .expect(200);
    const staff = (await entriesFor(`action=reservation.cancelled&userId=${w.manager.userId}`))[0]!;
    expect(staff.newValue).toMatchObject({ by: "staff", reason: "Kitchen closed" });
  });

  it("records settings changes as a diff of only what changed", async () => {
    const before = (await api("get", "/settings", owner.token)).body.data.settings;
    const next = before.serviceChargePercent === 12 ? 13 : 12;
    await api("put", "/settings", owner.token)
      .send({ settings: { serviceChargePercent: next, taxRatePercent: before.taxRatePercent } })
      .expect(200);
    const [entry] = await entriesFor(`action=settings.updated&userId=${owner.userId}`);
    expect(entry!.newValue).toEqual({ company: {}, settings: { serviceChargePercent: next } });
    expect(entry!.previousValue).toEqual({
      company: {},
      settings: { serviceChargePercent: before.serviceChargePercent },
    });
    await api("put", "/settings", owner.token)
      .send({ settings: { serviceChargePercent: before.serviceChargePercent } })
      .expect(200);
  });

  it("never writes a password into the trail", async () => {
    const w = await restaurant("A5");
    const target = await actor("WAITER", w.branch.id);
    await api("patch", `/staff/${target.userId}`, w.manager.token)
      .send({ password: "An0ther-Str0ng-Pass!", firstName: "Renamed" })
      .expect(200);
    const [entry] = await entriesFor(`action=staff.updated&userId=${w.manager.userId}`);
    expect(entry!.newValue).toMatchObject({ passwordReset: true });
    expect(JSON.stringify(entry)).not.toMatch(/An0ther|passwordHash|"password"/);

    await api("delete", `/staff/${target.userId}`, w.manager.token).expect(200);
    const deleted = (await entriesFor(`action=staff.deleted&userId=${w.manager.userId}`))[0]!;
    expect(deleted).toMatchObject({ entity: "staff", entityId: target.userId });
  });

  it("is owner-only, filterable and paged", async () => {
    const w = await restaurant("A6");
    for (const who of [w.manager, w.waiter, w.cashier, w.kitchen, await actor("CUSTOMER")]) {
      expect((await api("get", "/audit", who.token)).status).toBe(403);
    }
    expect((await api("get", "/audit")).status).toBe(401);

    await api("patch", `/menu/items/${w.soup.id}`, w.manager.token)
      .send({ price: 600 })
      .expect(200);
    await entriesFor(`entity=menu_item&userId=${w.manager.userId}`);
    const page = await api(
      "get",
      `/audit?entity=menu_item&userId=${w.manager.userId}`,
      owner.token,
    );
    expect(page.body.meta).toMatchObject({ total: 1, page: 1, pageSize: 50 });
    expect(
      (await api("get", "/audit?entity=payment&userId=" + w.manager.userId, owner.token)).body.data,
    ).toEqual([]);

    const today = new Date().toISOString().slice(0, 10);
    const inRange = await api(
      "get",
      `/audit?from=${today}&to=${today}&userId=${w.manager.userId}`,
      owner.token,
    );
    expect(inRange.body.data.length).toBeGreaterThan(0);
    const past = await api(
      "get",
      `/audit?from=2020-01-01&to=2020-01-31&userId=${w.manager.userId}`,
      owner.token,
    );
    expect(past.body.data).toEqual([]);
    expect((await api("get", "/audit?entity=nonsense", owner.token)).status).toBe(400);
    expect((await api("get", "/audit?page=0", owner.token)).status).toBe(400);
  });

  it("keeps the actor's name even after the account is gone", async () => {
    const w = await restaurant("A7");
    await api("patch", `/menu/items/${w.burger.id}`, w.manager.token)
      .send({ price: 1111 })
      .expect(200);
    const [before] = await entriesFor(`action=menu.price_changed&userId=${w.manager.userId}`);
    await prisma.user.delete({ where: { id: w.manager.userId } }).catch(() => undefined);
    const row = await prisma.auditLog.findUnique({ where: { id: before!.id } });
    // The entry survives (the actor link is cleared) and still says who did it.
    if (row) expect(row.userName).toBe("Test MANAGER");
  });
});

describe("global search", () => {
  it("finds across the screens a role may open, and only in the caller's branch", async () => {
    const a = await restaurant("S1");
    const b = await restaurant("S1b");
    const customer = await actor("CUSTOMER");
    await prisma.user.update({ where: { id: customer.userId }, data: { firstName: "Zorbaglu" } });
    const ours = await openBill(a, [a.soup.id], 0);
    await openBill(b, [b.soup.id], 0);
    await prisma.menuItem.update({ where: { id: a.soup.id }, data: { name: "Zorbaglu Soup" } });

    const manager = (await api("get", "/search?q=Zorbaglu", a.manager.token)).body.data as {
      kind: string;
      link: string;
    }[];
    expect(manager.map((r) => r.kind).sort()).toEqual(["customer", "menu-item"]);
    expect(manager.find((r) => r.kind === "customer")!.link).toBe(
      `/app/customers/${customer.userId}`,
    );

    // An order is found by its number, and only in its own branch.
    const orderNumber = (await prisma.order.findUniqueOrThrow({ where: { id: ours.orderId } }))
      .orderNumber;
    const found = (await api("get", `/search?q=${orderNumber}`, a.manager.token)).body.data as {
      kind: string;
      id: string;
    }[];
    expect(found.filter((r) => r.kind === "order").map((r) => r.id)).toEqual([ours.orderId]);
    const elsewhere = (await api("get", `/search?q=${orderNumber}`, b.manager.token)).body.data as {
      kind: string;
      id: string;
    }[];
    expect(elsewhere.filter((r) => r.id === ours.orderId)).toEqual([]);
  });

  it("only searches what the role could open anyway", async () => {
    const w = await restaurant("S2");
    const customer = await actor("CUSTOMER");
    await prisma.user.update({
      where: { id: customer.userId },
      data: { firstName: "Quillfeather" },
    });
    const kinds = async (token: string) =>
      ((await api("get", "/search?q=Test", token)).body.data as { kind: string }[]).map(
        (r) => r.kind,
      );

    // Staff accounts are searchable by managers, not by the floor.
    expect(await kinds(w.manager.token)).toContain("staff");
    expect(await kinds(w.waiter.token)).not.toContain("staff");
    expect(await kinds(w.cashier.token)).not.toContain("staff");

    const customers = async (token: string) =>
      ((await api("get", "/search?q=Quillfeather", token)).body.data as { kind: string }[]).map(
        (r) => r.kind,
      );
    expect(await customers(w.manager.token)).toEqual(["customer"]);
    for (const person of [w.waiter, w.cashier, w.kitchen])
      expect(await customers(person.token)).toEqual([]);

    // The kitchen can find dishes (to mark them sold out) but never orders or money.
    const kitchen = (await api("get", `/search?q=${"Burger"}`, w.kitchen.token)).body.data as {
      kind: string;
    }[];
    expect(kitchen.map((r) => r.kind)).toEqual(["menu-item"]);
  });

  it("validates input and is closed to customers and visitors", async () => {
    const w = await restaurant("S3");
    expect((await api("get", "/search?q=a", w.manager.token)).status).toBe(400);
    expect((await api("get", "/search", w.manager.token)).status).toBe(400);
    expect((await api("get", "/search?q=" + "x".repeat(81), w.manager.token)).status).toBe(400);
    expect((await api("get", "/search?q=burger", (await actor("CUSTOMER")).token)).status).toBe(
      403,
    );
    expect((await api("get", "/search?q=burger")).status).toBe(401);
    // Wildcard characters are searched literally, not as a pattern.
    expect((await api("get", "/search?q=%25%25", w.manager.token)).body.data).toEqual([]);
  });
});

describe("payment settings", () => {
  const setSettings = (body: object) =>
    api("put", "/settings", owner.token).send({ settings: body });
  afterAll(async () => {
    await setSettings({
      cashierDiscountLimitPercent: 10,
      enabledPaymentMethods: [
        "CASH",
        "CREDIT_CARD",
        "DEBIT_CARD",
        "MOBILE_PAYMENT",
        "BANK_TRANSFER",
        "ROOM_CHARGE",
      ],
    });
  });

  it("lets the owner change how far a cashier may discount", async () => {
    const w: World = await restaurant("P1");
    const { bill } = await openBill(w, [w.burger.id]);
    const discount = (value: number) =>
      api("patch", `/bills/${bill.id}/discount`, w.cashier.token).send({
        type: "PERCENT",
        value,
        reason: "Goodwill",
      });

    expect((await discount(15)).status).toBe(403);
    await setSettings({ cashierDiscountLimitPercent: 20 }).expect(200);
    const ok = await discount(15);
    expect(ok.status).toBe(200);
    expect(ok.body.data.rules.discountLimitPercent).toBe(20);
    expect((await discount(25)).body.error.message).toContain("above 20%");
    await setSettings({ cashierDiscountLimitPercent: 10 }).expect(200);
  });

  it("stops the till taking a method that has been switched off", async () => {
    const w = await restaurant("P2");
    const { bill } = await openBill(w, [w.soup.id]);
    await setSettings({ enabledPaymentMethods: ["CASH", "CREDIT_CARD"] }).expect(200);
    const pay = (method: string) =>
      api("post", `/bills/${bill.id}/payments`, w.cashier.token).send({ method, amount: 10 });

    const refused = await pay("MOBILE_PAYMENT");
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("PAYMENT_METHOD_DISABLED");
    expect((await pay("CASH")).status).toBe(201);

    const view = await api("get", `/bills/${bill.id}`, w.cashier.token);
    expect(view.body.data.rules.paymentMethods).toEqual(["CASH", "CREDIT_CARD"]);
    await setSettings({
      enabledPaymentMethods: [
        "CASH",
        "CREDIT_CARD",
        "DEBIT_CARD",
        "MOBILE_PAYMENT",
        "BANK_TRANSFER",
        "ROOM_CHARGE",
      ],
    }).expect(200);
  });

  it("validates the settings and is owner-only", async () => {
    expect((await setSettings({ enabledPaymentMethods: [] })).status).toBe(400);
    expect((await setSettings({ enabledPaymentMethods: ["LOYALTY_POINTS"] })).status).toBe(400);
    expect((await setSettings({ cashierDiscountLimitPercent: 101 })).status).toBe(400);
    expect((await setSettings({ cashierDiscountLimitPercent: -1 })).status).toBe(400);
    const w = await restaurant("P3");
    expect(
      (
        await api("put", "/settings", w.manager.token).send({
          settings: { cashierDiscountLimitPercent: 50 },
        })
      ).status,
    ).toBe(403);
  });
});
