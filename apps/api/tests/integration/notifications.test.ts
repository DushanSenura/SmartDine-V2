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
import {
  api,
  attach,
  eventually,
  inbox,
  openBill,
  payCash,
  pinRates,
  restaurant,
} from "./fixtures";

let restoreRates: () => Promise<void>;

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  restoreRates = await pinRates(true);
});
afterAll(async () => {
  await restoreRates();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});

const types = async (token: string) => (await inbox(token)).notifications.map((n) => n.type);

describe("the order journey tells the right people", () => {
  it("notifies approvers, the kitchen, the waiter and the cashier at each step — never the person who acted", async () => {
    const w = await restaurant("N1");
    const otherWaiter = await actor("WAITER", w.branch.id);
    const elsewhere = await restaurant("N1b"); // a different branch hears nothing

    const created = await api("post", "/orders", w.waiter.token).send({
      type: "DINE_IN",
      tableId: w.tables[0]!.id,
      items: [{ menuItemId: w.soup.id, quantity: 1, modifierIds: [] }],
    });
    const id = created.body.data.id as string;

    // Submitted by a waiter: managers and other waiters are asked to approve; the submitter isn't.
    await api("post", `/orders/${id}/submit`, w.waiter.token).expect(200);
    // The list and the unread count are separate reads, so wait until both show the new item.
    const asked = await eventually(
      () => inbox(w.manager.token),
      (b) => b.notifications.length > 0 && b.unreadCount > 0,
    );
    expect(asked.notifications[0]).toMatchObject({
      type: "ORDER_AWAITING_APPROVAL",
      title: "Table 1 is waiting for approval",
      link: `/app/orders/${id}`,
      read: false,
    });
    expect(asked.unreadCount).toBe(1);
    expect(await types(otherWaiter.token)).toContain("ORDER_AWAITING_APPROVAL");
    expect(await types(w.waiter.token)).toEqual([]);

    // Approved: the kitchen gets a ticket notification; the approver doesn't hear about their own action.
    await api("post", `/orders/${id}/approve`, w.manager.token).expect(200);
    const kitchen = await eventually(
      () => inbox(w.kitchen.token),
      (b) => b.notifications.length > 0,
    );
    expect(kitchen.notifications[0]).toMatchObject({
      type: "ORDER_SENT_TO_KITCHEN",
      title: "New order for Table 1",
      link: "/app/kitchen",
    });
    expect(await types(w.manager.token)).not.toContain("ORDER_SENT_TO_KITCHEN");

    // The kitchen finishes: the waiter who owns the order is told, and no one else on the floor.
    await api("post", `/kitchen/orders/${id}/ready`, w.kitchen.token).send({}).expect(200);
    const ready = await eventually(
      () => inbox(w.waiter.token),
      (b) => b.notifications.length > 0,
    );
    expect(ready.notifications[0]).toMatchObject({
      type: "DISH_READY",
      title: "Table 1: ready to serve",
      body: "Soup",
    });
    expect(await types(otherWaiter.token)).not.toContain("DISH_READY");

    // Asking for the bill reaches the cashier.
    await api("post", `/orders/${id}/serve`, w.waiter.token).send({}).expect(200);
    await api("post", `/orders/${id}/request-payment`, w.waiter.token).expect(200);
    const bill = await eventually(
      () => inbox(w.cashier.token),
      (b) => b.notifications.length > 0,
    );
    expect(bill.notifications[0]).toMatchObject({ type: "BILL_REQUESTED", link: "/app/cashier" });

    // Nothing leaks across branches.
    for (const person of [
      elsewhere.manager,
      elsewhere.waiter,
      elsewhere.kitchen,
      elsewhere.cashier,
    ]) {
      expect((await inbox(person.token)).notifications).toEqual([]);
    }
  });

  it("tells the kitchen when more dishes are added to an order already in progress", async () => {
    const w = await restaurant("N2");
    const created = await api("post", "/orders", w.waiter.token).send({
      type: "DINE_IN",
      tableId: w.tables[1]!.id,
      items: [{ menuItemId: w.soup.id, quantity: 1, modifierIds: [] }],
    });
    const id = created.body.data.id as string;
    await api("post", `/orders/${id}/approve`, w.waiter.token).expect(200);
    await api("post", `/orders/${id}/items`, w.waiter.token)
      .send({ items: [{ menuItemId: w.burger.id, quantity: 1, modifierIds: [] }] })
      .expect(201);
    const kitchen = await eventually(
      () => types(w.kitchen.token),
      (t) => t.includes("ORDER_UPDATED"),
    );
    expect(kitchen).toContain("ORDER_UPDATED");
  });

  it("thanks a customer once their attached bill is paid, with a link to their receipt", async () => {
    const w = await restaurant("N3");
    const customer = await actor("CUSTOMER");
    const { bill } = await openBill(w, [w.soup.id]);
    await attach(w, bill.id, customer.userId);
    await payCash(w, bill.id, bill.total);
    const received = await eventually(
      () => inbox(customer.token),
      (b) => b.notifications.length > 0,
    );
    expect(received.notifications[0]).toMatchObject({
      type: "PAYMENT_RECEIVED",
      title: "Payment received — thank you",
    });
    // It opens the receipt itself, not just the list.
    expect(received.notifications[0]!.link).toMatch(/^\/account\/invoices\/[0-9a-f-]{36}$/);
  });
});

describe("bookings, stock and rooms", () => {
  it("tells managers when stock newly runs low, but not again while it stays low", async () => {
    const w = await restaurant("N4");
    const second = await actor("MANAGER", w.branch.id);
    const item = (
      await api("post", "/inventory/items", w.manager.token).send({
        name: "Rice",
        sku: "RICE",
        category: "Dry",
        unit: "kg",
        quantity: 20,
        minimumQuantity: 10,
      })
    ).body.data;
    const use = (quantity: number) =>
      api("post", `/inventory/items/${item.id}/movements`, w.manager.token).send({
        type: "USE",
        quantity,
      });

    await use(5).expect(201); // 15 — still fine
    expect((await inbox(second.token)).notifications).toEqual([]);
    await use(7).expect(201); // 8 — newly low
    const low = await eventually(
      () => inbox(second.token),
      (b) => b.notifications.length > 0,
    );
    expect(low.notifications[0]).toMatchObject({
      type: "LOW_STOCK",
      title: "Rice is running low",
      body: "8 kg left",
    });
    // The manager who did it isn't told about their own action.
    expect(await types(w.manager.token)).toEqual([]);

    await use(1).expect(201); // 7 — still low: no second alert
    await new Promise((r) => setTimeout(r, 200));
    expect((await inbox(second.token)).notifications).toHaveLength(1);

    await use(7).expect(201); // 0 — now out of stock: that is news
    const out = await eventually(
      () => inbox(second.token),
      (b) => b.notifications.length > 1,
    );
    expect(out.notifications[0]).toMatchObject({
      type: "LOW_STOCK",
      title: "Rice is out of stock",
    });
  });

  it("confirms a customer's reservation and tells managers when it is cancelled", async () => {
    const w = await restaurant("N5");
    const customer = await actor("CUSTOMER");
    const day = futureDate(5);
    const area = await prisma.diningArea.findFirstOrThrow({ where: { branchId: w.branch.id } });
    await prisma.restaurantTable.updateMany({
      where: { branchId: w.branch.id },
      data: { capacity: 4 },
    });
    const booked = await api("post", "/reservations", customer.token).send({
      branchId: w.branch.id,
      date: day,
      time: "19:00",
      partySize: 2,
      diningAreaId: area.id,
      guestName: "Nina Notified",
      guestEmail: "nina@example.com",
      guestPhone: "+94 77 123 4567",
    });
    expect(booked.status).toBe(201);
    const confirmed = await eventually(
      () => inbox(customer.token),
      (b) => b.notifications.length > 0,
    );
    expect(confirmed.notifications[0]).toMatchObject({
      type: "RESERVATION_CONFIRMED",
      link: "/account/reservations",
    });
    expect(confirmed.notifications[0]!.body).toContain(booked.body.data.reference);

    await api("post", `/reservations/${booked.body.data.id}/cancel`, customer.token).expect(200);
    const told = await eventually(
      () => inbox(w.manager.token),
      (b) => b.notifications.length > 0,
    );
    expect(told.notifications[0]).toMatchObject({ type: "RESERVATION_CANCELLED" });
    expect(told.notifications[0]!.title).toContain("Nina Notified");
  });

  it("tells managers when a room goes into maintenance", async () => {
    const w = await restaurant("N6");
    const type = await prisma.roomType.create({
      data: {
        branchId: w.branch.id,
        name: "Std",
        slug: "std",
        maximumGuests: 2,
        bedType: "DOUBLE",
        basePrice: 100,
      },
    });
    const room = await prisma.room.create({
      data: { branchId: w.branch.id, roomTypeId: type.id, roomNumber: "501" },
    });
    const owner = await actor("OWNER");
    await api("patch", `/rooms/${room.id}/status`, owner.token)
      .send({ status: "MAINTENANCE" })
      .expect(200);
    const told = await eventually(
      () => inbox(w.manager.token),
      (b) => b.notifications.length > 0,
    );
    expect(told.notifications[0]).toMatchObject({
      type: "ROOM_MAINTENANCE",
      title: "Room 501 is maintenance",
    });
  });
});

describe("the notification centre", () => {
  async function withTwo() {
    const w = await restaurant("C1");
    const one = await actor("WAITER", w.branch.id);
    const two = await actor("WAITER", w.branch.id);
    await prisma.notification.createMany({
      data: [
        { userId: one.userId, type: "DISH_READY", title: "First", link: "/app/orders" },
        { userId: one.userId, type: "DISH_READY", title: "Second" },
        { userId: one.userId, type: "BILL_REQUESTED", title: "Third" },
        { userId: two.userId, type: "DISH_READY", title: "Someone else's" },
      ],
    });
    return { one, two };
  }

  it("lists newest first with an unread count, and filters to unread", async () => {
    const { one } = await withTwo();
    const all = await inbox(one.token);
    expect(all.unreadCount).toBe(3);
    expect(all.notifications).toHaveLength(3);
    const first = all.notifications[2]!;
    await api("post", `/notifications/${first.id}/read`, one.token).expect(200);
    const unread = (await api("get", "/notifications?unread=true", one.token)).body.data;
    expect(unread.unreadCount).toBe(2);
    expect(unread.notifications).toHaveLength(2);
    // Reading twice is harmless.
    await api("post", `/notifications/${first.id}/read`, one.token).expect(200);
    expect((await inbox(one.token)).unreadCount).toBe(2);
  });

  it("marks everything read, for the caller only", async () => {
    const { one, two } = await withTwo();
    const res = await api("post", "/notifications/read-all", one.token);
    expect(res.body.data.marked).toBe(3);
    expect((await inbox(one.token)).unreadCount).toBe(0);
    expect((await inbox(two.token)).unreadCount).toBe(1);
  });

  it("keeps everyone's notifications private", async () => {
    const { one, two } = await withTwo();
    const theirs = (await inbox(two.token)).notifications[0]!;
    expect((await api("post", `/notifications/${theirs.id}/read`, one.token)).status).toBe(404);
    expect((await inbox(two.token)).unreadCount).toBe(1);
    expect((await api("post", "/notifications/not-a-uuid/read", one.token)).status).toBe(400);
    expect((await api("get", "/notifications")).status).toBe(401);
    expect((await api("get", "/notifications?limit=0", one.token)).status).toBe(400);
  });

  it("works for customers as well as staff", async () => {
    const customer = await actor("CUSTOMER");
    await prisma.notification.create({
      data: { userId: customer.userId, type: "PAYMENT_RECEIVED", title: "Thanks" },
    });
    expect((await inbox(customer.token)).unreadCount).toBe(1);
  });
});
