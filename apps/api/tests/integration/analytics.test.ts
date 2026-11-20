import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actor,
  cleanupBranches,
  cleanupMenu,
  cleanupUsers,
  prisma,
  setupDatabase,
} from "./helpers";
import { api, attach, openBill, payCash, pinRates, restaurant, type World } from "./fixtures";

let restoreRates: () => Promise<void>;
let owner: Awaited<ReturnType<typeof actor>>;
let w: World;
let other: World;

/**
 * One branch with known history, so every figure below can be checked against a hand calculation:
 *   bill A  burger  1155.00  cash                                   customer 1
 *   bill B  soup     577.50  credit card, then 77.50 refunded
 *   bill C  soup     577.50  100 points + 477.50 cash               customer 2
 *   plus an open draft order on a fourth table, and some stock and rooms.
 * Net revenue = 1155 + 577.5 − 77.5 + 477.5 = 2132.50 (points are a tender, not takings).
 */
beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  restoreRates = await pinRates(true);
  owner = await actor("OWNER");
  w = await restaurant("AN1");
  other = await restaurant("AN2");
  await prisma.restaurantTable.create({
    data: {
      branchId: w.branch.id,
      diningAreaId: (await prisma.diningArea.findFirstOrThrow({ where: { branchId: w.branch.id } }))
        .id,
      tableNumber: "4",
      capacity: 4,
    },
  });
  const t4 = await prisma.restaurantTable.findFirstOrThrow({
    where: { branchId: w.branch.id, tableNumber: "4" },
  });

  const c1 = await actor("CUSTOMER");
  const c2 = await actor("CUSTOMER");
  await api("post", `/customers/${c2.userId}/loyalty`, owner.token)
    .send({ points: 100, note: "Seed" })
    .expect(201);

  const a = (await openBill(w, [w.burger.id], 0)).bill;
  await attach(w, a.id, c1.userId);
  await payCash(w, a.id, a.total);

  const b = (await openBill(w, [w.soup.id], 1)).bill;
  const paidB = (
    await api("post", `/bills/${b.id}/payments`, w.cashier.token).send({
      method: "CREDIT_CARD",
      amount: b.total,
    })
  ).body.data;
  await api("post", `/payments/${paidB.payments[0].id}/refund`, w.cashier.token)
    .send({ amount: 77.5, reason: "Cold soup" })
    .expect(201);

  const c = (await openBill(w, [w.soup.id], 2)).bill;
  await attach(w, c.id, c2.userId);
  await api("post", `/bills/${c.id}/redeem`, w.cashier.token).send({ points: 100 }).expect(201);
  await payCash(w, c.id, 477.5);

  // An open order keeps one table "active".
  await api("post", "/orders", w.waiter.token)
    .send({
      type: "DINE_IN",
      tableId: t4.id,
      items: [{ menuItemId: w.soup.id, quantity: 1, modifierIds: [] }],
    })
    .expect(201);

  // Stock: one item low, one fine, one with a spreadsheet-formula name.
  await api("post", "/inventory/items", w.manager.token)
    .send({
      name: "Rice",
      sku: "RICE",
      category: "Dry",
      unit: "kg",
      quantity: 3,
      minimumQuantity: 10,
      cost: 100,
    })
    .expect(201);
  const flour = (
    await api("post", "/inventory/items", w.manager.token).send({
      name: "=cmd|calc",
      sku: "FLOUR",
      category: "Dry",
      unit: "kg",
      quantity: 50,
      minimumQuantity: 5,
      cost: 80,
    })
  ).body.data;
  await api("post", `/inventory/items/${flour.id}/movements`, w.manager.token)
    .send({ type: "WASTE", quantity: 4, note: "Dropped" })
    .expect(201);

  // Rooms: two rooms, one checked in.
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
  const rooms = await Promise.all(
    ["101", "102"].map((roomNumber) =>
      prisma.room.create({ data: { branchId: w.branch.id, roomTypeId: type.id, roomNumber } }),
    ),
  );
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await prisma.room.update({ where: { id: rooms[0]!.id }, data: { status: "OCCUPIED" } });
  await prisma.roomBooking.create({
    data: {
      reference: `RM-AN${Date.now().toString(36).slice(-4).toUpperCase()}`,
      branchId: w.branch.id,
      roomTypeId: type.id,
      roomId: rooms[0]!.id,
      guestName: "Rita Resident",
      guestEmail: "r@example.com",
      guestPhone: "+94 71 000 0000",
      checkInDate: new Date(`${today}T00:00:00Z`),
      checkOutDate: new Date(`${tomorrow}T00:00:00Z`),
      nightCount: 1,
      adultCount: 1,
      roomSubtotal: 300,
      total: 300,
      bookingStatus: "CHECKED_IN",
    },
  });

  // A reservation starting now (a fixed offset would roll into tomorrow late in the evening), and a revenue-earning bill in the other branch (for the owner's comparison).
  await prisma.restaurantReservation.create({
    data: {
      reference: `AN${Date.now().toString(36).slice(-6).toUpperCase()}`,
      type: "TABLE",
      status: "CONFIRMED",
      branchId: w.branch.id,
      tableId: t4.id,
      guestName: "Rey Server",
      guestEmail: "r@example.com",
      guestPhone: "+94 77 000 0000",
      partySize: 3,
      startsAt: new Date(Date.now() + 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
    },
  });
  const o = (await openBill(other, [other.burger.id], 0)).bill;
  await payCash(other, o.id, o.total);
});
afterAll(async () => {
  await restoreRates();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});

const dashboard = async (token: string, query = "") =>
  api("get", `/analytics/dashboard${query}`, token);

describe("the dashboard", () => {
  it("adds up today's money, orders and customers exactly", async () => {
    const res = await dashboard(w.manager.token);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.scope).toMatchObject({
      branchId: w.branch.id,
      currency: "LKR",
      timezone: "Asia/Colombo",
      days: 14,
    });
    expect(d.scope.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.cards).toMatchObject({
      revenueToday: 2132.5,
      ordersToday: 3, // the draft isn't an order yet
      averageOrderValue: 710.83, // 2132.50 over 3 paid bills
      customersToday: 2,
      totalTables: 4,
      activeTables: 1, // the draft on table 4
      reservationsToday: 1,
      roomsTotal: 2,
      roomsOccupied: 1,
      roomOccupancyPercent: 50,
      roomsAvailable: 1,
      lowStockItems: 1,
    });
    expect(d.cards.kitchenAverageMinutes).toBeGreaterThanOrEqual(0);
  });

  it("trends, categories, popular dishes and methods match the data", async () => {
    const d = (await dashboard(w.manager.token, "?days=7")).body.data;
    expect(d.revenueTrend).toHaveLength(7);
    expect(d.revenueTrend.at(-1)).toMatchObject({
      date: d.scope.today,
      revenue: 2132.5,
      orders: 3,
    });
    expect(d.revenueTrend.slice(0, -1).every((p: { revenue: number }) => p.revenue === 0)).toBe(
      true,
    );

    expect(d.popularItems.map((i: { name: string }) => i.name)).toEqual(["Soup", "Burger"]);
    expect(d.popularItems[0]).toMatchObject({ quantity: 2, revenue: 1000 });
    expect(d.salesByCategory).toHaveLength(1);
    expect(d.salesByCategory[0].revenue).toBe(2000);

    const method = (m: string) => d.paymentMethods.find((x: { method: string }) => x.method === m);
    expect(method("CASH")).toMatchObject({ total: 1632.5, count: 2 });
    expect(method("CREDIT_CARD")).toMatchObject({ total: 577.5, count: 1 });
    expect(method("LOYALTY_POINTS")).toMatchObject({ total: 100, count: 1 });

    expect(d.hourlySales).toHaveLength(24);
    // Hourly sales are what was collected (before the refund), never points.
    expect(d.hourlySales.reduce((s: number, h: { revenue: number }) => s + h.revenue, 0)).toBe(
      2210,
    );
  });

  it("shows occupancy, reservation patterns and the one-branch view", async () => {
    const d = (await dashboard(w.manager.token, "?days=3")).body.data;
    expect(d.occupancyTrend).toHaveLength(3);
    expect(d.occupancyTrend.at(-1)).toMatchObject({ date: d.scope.today, occupancyPercent: 50 });
    expect(d.reservationPatterns).toHaveLength(7);
    expect(d.reservationPatterns.reduce((s: number, p: { count: number }) => s + p.count, 0)).toBe(
      1,
    );
    expect(d.branchComparison).toBeNull();
  });

  it("lets an owner see one branch or compare them all", async () => {
    const one = (await dashboard(owner.token, `?branchId=${w.branch.id}`)).body.data;
    expect(one.scope.name).toBe(w.branch.name);
    expect(one.cards.revenueToday).toBe(2132.5);

    const all = (await dashboard(owner.token)).body.data;
    expect(all.scope).toMatchObject({ branchId: null, name: "All branches" });
    const ours = all.branchComparison.find((b: { branchId: string }) => b.branchId === w.branch.id);
    const theirs = all.branchComparison.find(
      (b: { branchId: string }) => b.branchId === other.branch.id,
    );
    expect(ours).toMatchObject({ revenue: 2132.5, orders: 3, occupancyPercent: 50 });
    expect(theirs).toMatchObject({ revenue: 1155, orders: 1, occupancyPercent: 0 });
    expect(all.cards.revenueToday).toBeGreaterThanOrEqual(2132.5 + 1155);
  });

  it("keeps managers to their branch and everyone else out", async () => {
    expect((await dashboard(w.manager.token, `?branchId=${other.branch.id}`)).status).toBe(403);
    expect((await dashboard(other.manager.token, `?branchId=${w.branch.id}`)).status).toBe(403);
    for (const who of [w.waiter, w.cashier, w.kitchen, await actor("CUSTOMER")]) {
      expect((await dashboard(who.token)).status).toBe(403);
    }
    expect((await dashboard("")).status).toBe(401);
    expect((await dashboard(w.manager.token, "?days=0")).status).toBe(400);
    expect((await dashboard(w.manager.token, "?days=91")).status).toBe(400);
  });
});

const report = (token: string, type: string, query = "") =>
  api("get", `/reports/${type}${query}`, token);
const data = async (type: string, query = "") =>
  (await report(w.manager.token, type, query)).body.data;

describe("reports", () => {
  it("sales: daily, weekly and monthly, with totals", async () => {
    const daily = await data("sales");
    expect(daily.title).toBe("Sales (daily, weekly, monthly)");
    expect(daily.rows).toHaveLength(1);
    expect(daily.rows[0]).toMatchObject({
      bills: 3,
      gross: 2210,
      refunds: 77.5,
      net: 2132.5,
      average: 710.83,
    });
    expect(daily.totals).toMatchObject({ period: "Total", bills: 3, net: 2132.5 });
    expect((await data("sales", "?group=month")).rows[0].period).toMatch(/^\d{4}-\d{2}$/);
    expect((await data("sales", "?group=week")).rows[0].period).toMatch(
      /^Week of \d{4}-\d{2}-\d{2}$/,
    );
  });

  it("orders, menu performance and employee performance", async () => {
    const orders = await data("orders");
    expect(orders.rows).toHaveLength(4);
    expect(orders.columns.map((c: { key: string }) => c.key)).toContain("waiter");

    const menu = await data("menu-performance");
    expect(menu.rows[0]).toMatchObject({ item: "Soup", quantity: 2, revenue: 1000, orders: 2 });
    expect(menu.rows[1]).toMatchObject({ item: "Burger", quantity: 1, revenue: 1000 });

    const staff = await data("employee-performance");
    const waiter = staff.rows.find((r: { role: string }) => r.role === "waiter");
    const cashier = staff.rows.find((r: { role: string }) => r.role === "cashier");
    expect(waiter).toMatchObject({ orders: 3 });
    expect(cashier).toMatchObject({ payments: 3, collected: 2210, refunds: 1, refunded: 77.5 });
  });

  it("payments, refunds, loyalty and waste", async () => {
    const payments = await data("payments");
    expect(payments.rows).toHaveLength(4); // including the points payment
    expect(payments.totals).toMatchObject({ amount: 2310, refunded: 77.5 });

    const refunds = await data("refunds");
    expect(refunds.rows).toHaveLength(1);
    expect(refunds.rows[0]).toMatchObject({
      amount: 77.5,
      reason: "Cold soup",
      method: "credit card",
    });

    // Loyalty is company-wide (customers aren't tied to a branch), so look for our customer's row.
    const loyalty = await data("loyalty");
    expect(loyalty.rows.some((r: { redeemed: number }) => r.redeemed === 100)).toBe(true);
    expect(loyalty.rows.some((r: { earned: number }) => r.earned > 0)).toBe(true);

    const waste = await data("waste");
    expect(waste.rows).toHaveLength(1);
    expect(waste.rows[0]).toMatchObject({
      item: "=cmd|calc",
      quantity: 4,
      cost: 320,
      note: "Dropped",
    });
  });

  it("inventory, room occupancy and room revenue", async () => {
    const stock = await data("inventory");
    expect(stock.rows.find((r: { sku: string }) => r.sku === "RICE")).toMatchObject({
      status: "Low stock",
      value: 300,
    });
    expect(stock.subtitle).toContain("stock as of now");

    const occupancy = await data(
      "room-occupancy",
      `?from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`,
    );
    expect(occupancy.rows).toHaveLength(1);
    expect(occupancy.rows[0]).toMatchObject({ rooms: 2, occupied: 1, occupancy: 50 });

    const revenue = await data("room-revenue");
    expect(revenue.rows).toHaveLength(1);
    expect(revenue.rows[0]).toMatchObject({ guest: "Rita Resident", nights: 1, total: 300 });
  });

  it("reservations are counted by day", async () => {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const res = await data("reservations", `?from=${from}&to=${to}`);
    expect(res.rows.reduce((s: number, r: { total: number }) => s + r.total, 0)).toBe(1);
  });

  it("branch performance compares branches, for owners only", async () => {
    expect((await report(w.manager.token, "branch-performance")).status).toBe(403);
    const res = (await report(owner.token, "branch-performance", `?branchId=${w.branch.id}`)).body
      .data;
    // Even with one branch selected, a comparison is company-wide.
    const ours = res.rows.find((r: { branch: string }) => r.branch === w.branch.name);
    const theirs = res.rows.find((r: { branch: string }) => r.branch === other.branch.name);
    expect(ours).toMatchObject({ orders: 3, bills: 3, net: 2132.5, average: 710.83 });
    expect(theirs).toMatchObject({ orders: 1, bills: 1, net: 1155 });
  });

  it("adds a branch column when an owner looks at every branch", async () => {
    const all = (await report(owner.token, "payments")).body.data;
    expect(all.columns[0].key).toBe("branch");
    const names = new Set(all.rows.map((r: { branch: string }) => r.branch));
    expect(names.has(w.branch.name) && names.has(other.branch.name)).toBe(true);
    expect((await data("payments")).columns.map((c: { key: string }) => c.key)).not.toContain(
      "branch",
    );
  });

  it("validates the request and keeps it to managers and owners", async () => {
    expect((await report(w.manager.token, "nonsense")).status).toBe(400);
    expect((await report(w.manager.token, "sales", "?from=2026-02-01&to=2026-01-01")).status).toBe(
      400,
    );
    expect((await report(w.manager.token, "sales", "?from=2020-01-01&to=2026-01-01")).status).toBe(
      400,
    );
    expect((await report(w.manager.token, "sales", "?group=year")).status).toBe(400);
    expect((await report(w.manager.token, "sales", `?branchId=${other.branch.id}`)).status).toBe(
      403,
    );
    for (const who of [w.waiter, w.cashier, w.kitchen, await actor("CUSTOMER")]) {
      expect((await report(who.token, "sales")).status).toBe(403);
    }
    expect((await report("", "sales")).status).toBe(401);
  });
});

describe("exports", () => {
  it("downloads CSV with a header, the data and a totals row, safely", async () => {
    const res = await report(w.manager.token, "sales", "?format=csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="sales-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    // Excel needs the byte-order mark to read non-ASCII text correctly.
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    const lines = res.text.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("Day,Bills paid,Collected,Refunds,Net revenue,Average bill");
    expect(lines).toHaveLength(3); // header, one day, totals
    expect(lines[1]).toMatch(/,3,2210\.00,77\.50,2132\.50,710\.83$/);
    expect(lines[2]).toMatch(/^Total,3,2210\.00,77\.50,2132\.50,710\.83$/);
  });

  it("neutralises spreadsheet formulas in exported text", async () => {
    const csv = (await report(w.manager.token, "inventory", "?format=csv")).text;
    expect(csv).toContain(",'=cmd|calc,");
    expect(csv).not.toMatch(/,=cmd\|calc,/);
  });

  it("downloads a real PDF", async () => {
    const res = await report(w.manager.token, "payments", "?format=pdf")
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    const text = (res.body as Buffer).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Payments");
    expect(text).toContain("%%EOF");
  });
});
