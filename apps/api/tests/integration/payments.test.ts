import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actor,
  ALL_DAYS_OPEN,
  app,
  bearer,
  cleanupBranches,
  cleanupMenu,
  cleanupUsers,
  createBranch,
  futureDate,
  prisma,
  request,
  setupDatabase,
} from "./helpers";

// Rates are company-wide, so pin them for the run and restore them afterwards.
let originalRates: { taxRatePercent: unknown; serviceChargePercent: unknown } | null = null;

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  const company = await prisma.company.findFirstOrThrow({ where: { deletedAt: null } });
  const current = await prisma.companySettings.findUnique({ where: { companyId: company.id } });
  originalRates = current
    ? { taxRatePercent: current.taxRatePercent, serviceChargePercent: current.serviceChargePercent }
    : null;
  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    create: { companyId: company.id, taxRatePercent: 5, serviceChargePercent: 10 },
    update: { taxRatePercent: 5, serviceChargePercent: 10 },
  });
});
afterAll(async () => {
  const company = await prisma.company.findFirstOrThrow({ where: { deletedAt: null } });
  if (originalRates) {
    await prisma.companySettings.update({
      where: { companyId: company.id },
      data: originalRates as { taxRatePercent: number; serviceChargePercent: number },
    });
  }
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});

const api = (method: "get" | "post" | "patch" | "delete", path: string, token?: string) => {
  const req = request(app)[method](`/api/v2${path}`);
  return token ? req.set(bearer(token)) : req;
};

async function restaurant(label: string) {
  const branch = await createBranch(label, {
    timezone: "Asia/Colombo",
    openingHours: ALL_DAYS_OPEN,
  });
  const area = await prisma.diningArea.create({ data: { branchId: branch.id, name: "Hall" } });
  const tables = await Promise.all(
    ["1", "2"].map((tableNumber) =>
      prisma.restaurantTable.create({
        data: { branchId: branch.id, diningAreaId: area.id, tableNumber, capacity: 4 },
      }),
    ),
  );
  const category = await prisma.menuCategory.create({
    data: { name: `IT Pay ${label}`, slug: `it-pay-${label.toLowerCase()}-${Date.now()}` },
  });
  const dish = (name: string, price: number) =>
    prisma.menuItem.create({
      data: {
        branchId: branch.id,
        categoryId: category.id,
        name,
        slug: name.toLowerCase(),
        price,
      },
    });
  const burger = await dish("Burger", 1000);
  const soup = await dish("Soup", 500);
  const waiter = await actor("WAITER", branch.id);
  const manager = await actor("MANAGER", branch.id);
  const kitchen = await actor("KITCHEN", branch.id);
  const cashier = await actor("CASHIER", branch.id);
  return { branch, tables, burger, soup, waiter, manager, kitchen, cashier };
}
type World = Awaited<ReturnType<typeof restaurant>>;

const line = (menuItemId: string) => ({ menuItemId, quantity: 1, modifierIds: [] });

/** Takes an order all the way to "bill requested" through the real endpoints. */
async function billRequested(w: World, items: string[], tableIndex = 0, extra: object = {}) {
  const created = await api("post", "/orders", w.waiter.token).send({
    type: "DINE_IN",
    tableId: w.tables[tableIndex]!.id,
    items: items.map(line),
    ...extra,
  });
  const id = created.body.data.id as string;
  await api("post", `/orders/${id}/approve`, w.waiter.token).expect(200);
  await api("post", `/kitchen/orders/${id}/ready`, w.kitchen.token).send({}).expect(200);
  await api("post", `/orders/${id}/serve`, w.waiter.token).send({}).expect(200);
  await api("post", `/orders/${id}/request-payment`, w.waiter.token).expect(200);
  return id;
}

const generate = (w: World, orderId: string) =>
  api("post", "/bills", w.cashier.token).send({ orderId });
const pay = (w: World, billId: string, body: object, token = w.cashier.token) =>
  api("post", `/bills/${billId}/payments`, token).send(body);

describe("the bill", () => {
  it("is raised once per served order and adds service charge and tax in the right order", async () => {
    const w = await restaurant("B1");
    const orderId = await billRequested(w, [w.burger.id, w.soup.id]);

    const queue = await api("get", `/bills/queue?branchId=${w.branch.id}`, w.cashier.token);
    expect(queue.body.data).toHaveLength(1);
    expect(queue.body.data[0]).toMatchObject({
      orderId,
      location: "Table 1",
      orderStatus: "PAYMENT_REQUESTED",
      billId: null,
    });

    const first = await generate(w, orderId);
    expect(first.status).toBe(200);
    // 1500 + 10% service (150) = 1650, + 5% tax (82.50) = 1732.50
    expect(first.body.data).toMatchObject({
      status: "OPEN",
      subtotal: 1500,
      discountAmount: 0,
      serviceChargeAmount: 150,
      taxAmount: 82.5,
      total: 1732.5,
      paidAmount: 0,
      balance: 1732.5,
      currency: "LKR",
      location: "Table 1",
    });
    expect(first.body.data.billNumber).toMatch(/^B-\d{8}-\d{3}$/);
    expect(first.body.data.lines.map((l: { name: string }) => l.name).sort()).toEqual([
      "Burger",
      "Soup",
    ]);

    const again = await generate(w, orderId);
    expect(again.body.data.id).toBe(first.body.data.id);

    const queued = await api("get", `/bills/queue?branchId=${w.branch.id}`, w.cashier.token);
    expect(queued.body.data[0]).toMatchObject({ billId: first.body.data.id, total: 1732.5 });
  });

  it("is refused for an order that is not fully served, and rates are snapshotted", async () => {
    const w = await restaurant("B2");
    const created = await api("post", "/orders", w.waiter.token).send({
      type: "DINE_IN",
      tableId: w.tables[0]!.id,
      items: [line(w.soup.id)],
    });
    const early = await generate(w, created.body.data.id);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("ORDER_NOT_BILLABLE");

    const orderId = await billRequested(w, [w.soup.id], 1);
    const bill = (await generate(w, orderId)).body.data;
    await prisma.companySettings.updateMany({ data: { taxRatePercent: 99 } });
    const reread = await api("get", `/bills/${bill.id}`, w.cashier.token);
    await prisma.companySettings.updateMany({ data: { taxRatePercent: 5 } });
    expect(reread.body.data).toMatchObject({ taxPercent: 5, total: bill.total });
  });

  it("gives cashiers a 10% discount limit and lets managers go beyond it", async () => {
    const w = await restaurant("B3");
    const orderId = await billRequested(w, [w.burger.id]);
    const bill = (await generate(w, orderId)).body.data;
    const discount = (token: string, body: object) =>
      api("patch", `/bills/${bill.id}/discount`, token).send(body);

    const ok = await discount(w.cashier.token, {
      type: "PERCENT",
      value: 10,
      reason: "Loyal guest",
    });
    expect(ok.status).toBe(200);
    // 1000 − 100 = 900; +10% = 990; +5% = 1039.50
    expect(ok.body.data).toMatchObject({
      discountAmount: 100,
      discountReason: "Loyal guest",
      total: 1039.5,
    });

    expect(
      (await discount(w.cashier.token, { type: "PERCENT", value: 25, reason: "Complaint" })).status,
    ).toBe(403);
    expect(
      (await discount(w.cashier.token, { type: "AMOUNT", value: 150, reason: "Complaint" })).status,
    ).toBe(403);
    expect((await discount(w.cashier.token, { type: "PERCENT", value: 5 })).status).toBe(400); // no reason

    const big = await discount(w.manager.token, {
      type: "PERCENT",
      value: 25,
      reason: "Complaint",
    });
    expect(big.status).toBe(200);
    expect(big.body.data.discountAmount).toBe(250);

    const cleared = await discount(w.cashier.token, { type: "PERCENT", value: 0 });
    expect(cleared.body.data).toMatchObject({ discountAmount: 0, discountType: null, total: 1155 });
  });

  it("settles a complimentary bill straight away", async () => {
    const w = await restaurant("B4");
    const orderId = await billRequested(w, [w.soup.id]);
    const bill = (await generate(w, orderId)).body.data;
    const res = await api("patch", `/bills/${bill.id}/discount`, w.manager.token).send({
      type: "PERCENT",
      value: 100,
      reason: "On the house",
    });
    expect(res.body.data).toMatchObject({ status: "PAID", total: 0, orderStatus: "COMPLETED" });
    expect(res.body.data.receiptId).toBeTruthy();
  });
});

describe("taking payment", () => {
  it("completes an order through a split cash + card payment and issues a receipt", async () => {
    const w = await restaurant("P1");
    const orderId = await billRequested(w, [w.burger.id, w.soup.id], 0, { guestName: "Ada" });
    const bill = (await generate(w, orderId)).body.data;

    const first = await pay(w, bill.id, { method: "CASH", amount: 1000, tendered: 1500 });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ status: "OPEN", paidAmount: 1000, balance: 732.5 });
    expect(first.body.data.payments[0]).toMatchObject({
      method: "CASH",
      tendered: 1500,
      change: 500,
    });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      "PAYMENT_REQUESTED",
    );

    const last = await pay(w, bill.id, {
      method: "CREDIT_CARD",
      amount: 732.5,
      reference: "AUTH-4821",
    });
    expect(last.status).toBe(201);
    expect(last.body.data).toMatchObject({
      status: "PAID",
      balance: 0,
      orderStatus: "COMPLETED",
    });
    expect(last.body.data.payments).toHaveLength(2);

    // The order moved PAID → COMPLETED and the guests' table is waiting to be cleaned.
    const order = await api("get", `/orders/${orderId}`, w.waiter.token);
    expect(order.body.data.status).toBe("COMPLETED");
    expect(order.body.data.history.slice(-2).map((h: { toStatus: string }) => h.toStatus)).toEqual([
      "PAID",
      "COMPLETED",
    ]);
    expect(
      (await prisma.restaurantTable.findUniqueOrThrow({ where: { id: w.tables[0]!.id } })).status,
    ).toBe("CLEANING");

    // The receipt is a snapshot with both payments.
    const receipt = await api("get", `/receipts/${last.body.data.receiptId}`, w.cashier.token);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data).toMatchObject({
      billNumber: bill.billNumber,
      orderNumber: bill.orderNumber,
      guestName: "Ada",
      location: "Table 1",
      total: 1732.5,
      taxAmount: 82.5,
      serviceChargeAmount: 150,
      refundedAmount: 0,
    });
    expect(receipt.body.data.receiptNumber).toMatch(/^R-\d{8}-\d{3}$/);
    expect(receipt.body.data.payments.map((p: { method: string }) => p.method)).toEqual([
      "CASH",
      "CREDIT_CARD",
    ]);

    const pdf = await api("get", `/receipts/${receipt.body.data.id}/pdf`, w.cashier.token)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    const text = (pdf.body as Buffer).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toContain(receipt.body.data.receiptNumber);
    expect(text).toContain("1,732.50");

    // Nothing is waiting any more.
    const queue = await api("get", `/bills/queue?branchId=${w.branch.id}`, w.cashier.token);
    expect(queue.body.data).toHaveLength(0);
  });

  it("rejects overpayment, short cash and payments on a closed bill", async () => {
    const w = await restaurant("P2");
    const orderId = await billRequested(w, [w.soup.id]);
    const bill = (await generate(w, orderId)).body.data; // 500 → 550 → 577.50

    expect((await pay(w, bill.id, { method: "CARD", amount: 10 })).status).toBe(400); // unknown method
    expect((await pay(w, bill.id, { method: "CASH", amount: 100, tendered: 50 })).status).toBe(400);
    expect(
      (await pay(w, bill.id, { method: "CREDIT_CARD", amount: 100, tendered: 200 })).status,
    ).toBe(400); // only cash has "tendered"
    expect((await pay(w, bill.id, { method: "CASH", amount: 0 })).status).toBe(400);
    expect((await pay(w, bill.id, { method: "CASH", amount: -5 })).status).toBe(400);
    const over = await pay(w, bill.id, { method: "CASH", amount: 600 });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("OVERPAYMENT");

    await pay(w, bill.id, { method: "CASH", amount: 577.5 }).expect(201);
    const closed = await pay(w, bill.id, { method: "CASH", amount: 1 });
    expect(closed.body.error.code).toBe("BILL_CLOSED");
    const discount = await api("patch", `/bills/${bill.id}/discount`, w.cashier.token).send({
      type: "PERCENT",
      value: 5,
      reason: "Too late",
    });
    expect(discount.body.error.code).toBe("BILL_CLOSED");
  });

  it("locks the discount once any payment was taken", async () => {
    const w = await restaurant("P3");
    const bill = (await generate(w, await billRequested(w, [w.burger.id]))).body.data;
    await pay(w, bill.id, { method: "CASH", amount: 100 }).expect(201);
    const res = await api("patch", `/bills/${bill.id}/discount`, w.manager.token).send({
      type: "PERCENT",
      value: 5,
      reason: "Changed my mind",
    });
    expect(res.body.error.code).toBe("BILL_HAS_PAYMENTS");
  });

  it("never double-charges when two cashiers pay the full balance at once", async () => {
    const w = await restaurant("P4");
    const bill = (await generate(w, await billRequested(w, [w.burger.id]))).body.data; // 1155
    const second = await actor("CASHIER", w.branch.id);

    const results = await Promise.all([
      pay(w, bill.id, { method: "CASH", amount: 1155 }),
      pay(w, bill.id, { method: "DEBIT_CARD", amount: 1155 }, second.token),
      pay(w, bill.id, { method: "MOBILE_PAYMENT", amount: 1155 }, second.token),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);

    const stored = await prisma.bill.findUniqueOrThrow({
      where: { id: bill.id },
      include: { payments: true, receipt: true },
    });
    expect(stored.status).toBe("PAID");
    expect(Number(stored.paidAmount)).toBe(1155);
    expect(stored.payments).toHaveLength(1);
    expect(stored.receipt).not.toBeNull();
  });

  it("numbers simultaneous bills and receipts uniquely", async () => {
    const w = await restaurant("P5");
    const orders = await Promise.all([0, 1].map((i) => billRequested(w, [w.soup.id], i)));
    const bills = await Promise.all(orders.map((id) => generate(w, id)));
    const numbers = bills.map((b) => b.body.data.billNumber as string);
    expect(new Set(numbers).size).toBe(2);

    const paid = await Promise.all(
      bills.map((b) => pay(w, b.body.data.id, { method: "CASH", amount: 577.5 })),
    );
    expect(paid.every((r) => r.status === 201)).toBe(true);
    const receipts = await prisma.receipt.findMany({ where: { branchId: w.branch.id } });
    expect(new Set(receipts.map((r) => r.receiptNumber)).size).toBe(2);
  });

  it("freezes the order once money has been taken", async () => {
    const w = await restaurant("P6");
    const orderId = await billRequested(w, [w.burger.id]);
    const bill = (await generate(w, orderId)).body.data;
    await pay(w, bill.id, { method: "CASH", amount: 200 }).expect(201);

    const add = await api("post", `/orders/${orderId}/items`, w.manager.token).send({
      items: [line(w.soup.id)],
    });
    expect(add.status).toBe(409); // already past the point where dishes can be added
    const cancel = await api("post", `/orders/${orderId}/cancel`, w.manager.token).send({});
    expect(cancel.body.error.code).toBe("ORDER_HAS_PAYMENTS");
  });

  it("voids an unpaid bill together with its order", async () => {
    const w = await restaurant("P7");
    const orderId = await billRequested(w, [w.soup.id]);
    const bill = (await generate(w, orderId)).body.data;
    await api("post", `/orders/${orderId}/cancel`, w.manager.token)
      .send({ reason: "Walked out" })
      .expect(200);
    const after = await api("get", `/bills/${bill.id}`, w.cashier.token);
    expect(after.body.data.status).toBe("VOID");
    expect((await pay(w, bill.id, { method: "CASH", amount: 10 })).body.error.code).toBe(
      "BILL_CLOSED",
    );
  });
});

describe("refunds", () => {
  it("lets a cashier refund part, then the rest, and rejects over-refunds", async () => {
    const w = await restaurant("R1");
    const orderId = await billRequested(w, [w.soup.id]);
    const bill = (await generate(w, orderId)).body.data; // 577.50
    const paid = (await pay(w, bill.id, { method: "CASH", amount: 577.5 })).body.data;
    const paymentId = paid.payments[0].id as string;
    const refund = (amount: number, reason = "Cold soup") =>
      api("post", `/payments/${paymentId}/refund`, w.cashier.token).send({ amount, reason });

    expect((await refund(1000)).body.error.code).toBe("REFUND_EXCEEDS_PAYMENT");
    expect((await refund(10, "")).status).toBe(400); // reason required

    const partial = await refund(77.5);
    expect(partial.status).toBe(201);
    expect(partial.body.data).toMatchObject({ status: "PAID", refundedAmount: 77.5 });
    expect(partial.body.data.payments[0].refunds[0]).toMatchObject({
      amount: 77.5,
      reason: "Cold soup",
    });
    expect((await refund(501)).body.error.code).toBe("REFUND_EXCEEDS_PAYMENT");

    const rest = await refund(500);
    expect(rest.body.data).toMatchObject({ status: "REFUNDED", refundedAmount: 577.5 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      "REFUNDED",
    );

    const receipt = await api("get", `/receipts/${paid.receiptId}`, w.cashier.token);
    expect(receipt.body.data.refundedAmount).toBe(577.5);
  });

  it("is limited to roles holding payments:refund", async () => {
    const w = await restaurant("R2");
    const bill = (await generate(w, await billRequested(w, [w.soup.id]))).body.data;
    const paid = (await pay(w, bill.id, { method: "CASH", amount: 577.5 })).body.data;
    const url = `/payments/${paid.payments[0].id}/refund`;
    const body = { amount: 10, reason: "Because" };
    expect((await api("post", url, w.manager.token).send(body)).status).toBe(403);
    expect((await api("post", url, w.waiter.token).send(body)).status).toBe(403);
    expect((await api("post", url, w.kitchen.token).send(body)).status).toBe(403);
  });
});

describe("room charge & folio", () => {
  it("posts room-service bills to the guest's folio and refuses room charge elsewhere", async () => {
    const w = await restaurant("F1");
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
      data: { branchId: w.branch.id, roomTypeId: type.id, roomNumber: "301" },
    });
    const stay = await prisma.roomBooking.create({
      data: {
        reference: `RM-IT${Date.now().toString(36).slice(-4).toUpperCase()}`,
        branchId: w.branch.id,
        roomTypeId: type.id,
        roomId: room.id,
        guestName: "Grace Hopper",
        guestEmail: "g@example.com",
        guestPhone: "+94 71 000 0000",
        checkInDate: new Date(`${futureDate(0)}T00:00:00Z`),
        checkOutDate: new Date(`${futureDate(2)}T00:00:00Z`),
        nightCount: 2,
        adultCount: 1,
        roomSubtotal: 200,
        total: 200,
        bookingStatus: "CHECKED_IN",
      },
    });

    // A dine-in bill cannot be charged to a room.
    const dineIn = (await generate(w, await billRequested(w, [w.soup.id]))).body.data;
    const refused = await pay(w, dineIn.id, { method: "ROOM_CHARGE", amount: 100 });
    expect(refused.body.error.code).toBe("ROOM_CHARGE_UNAVAILABLE");

    const created = await api("post", "/orders", w.waiter.token).send({
      type: "ROOM_SERVICE",
      roomId: room.id,
      items: [line(w.soup.id)],
    });
    const id = created.body.data.id as string;
    await api("post", `/orders/${id}/approve`, w.waiter.token).expect(200);
    await api("post", `/kitchen/orders/${id}/ready`, w.kitchen.token).send({}).expect(200);
    await api("post", `/orders/${id}/serve`, w.waiter.token).send({}).expect(200);
    await api("post", `/orders/${id}/request-payment`, w.waiter.token).expect(200);

    const bill = (await generate(w, id)).body.data;
    expect(bill).toMatchObject({ location: "Room 301", roomBookingId: stay.id });
    const paid = await pay(w, bill.id, { method: "ROOM_CHARGE", amount: bill.total });
    expect(paid.body.data.status).toBe("PAID");

    const folio = await api("get", `/folios/${stay.id}`, w.manager.token);
    expect(folio.status).toBe(200);
    expect(folio.body.data).toMatchObject({ guestName: "Grace Hopper", total: 577.5 });
    expect(folio.body.data.charges).toHaveLength(1);

    // A refund takes the charge back off the folio.
    await api("post", `/payments/${paid.body.data.payments[0].id}/refund`, w.cashier.token)
      .send({ amount: 577.5, reason: "Wrong room" })
      .expect(201);
    expect((await api("get", `/folios/${stay.id}`, w.manager.token)).body.data.total).toBe(0);
  });
});

describe("history, summary & access control", () => {
  it("summarises today's takings by method for the cashier's own till", async () => {
    const w = await restaurant("S1");
    const other = await actor("CASHIER", w.branch.id);
    const a = (await generate(w, await billRequested(w, [w.soup.id], 0))).body.data;
    const b = (await generate(w, await billRequested(w, [w.soup.id], 1))).body.data;
    await pay(w, a.id, { method: "CASH", amount: 577.5 }).expect(201);
    await pay(w, b.id, { method: "CREDIT_CARD", amount: 577.5 }, other.token).expect(201);

    const mine = await api("get", `/payments/summary?branchId=${w.branch.id}`, w.cashier.token);
    expect(mine.body.data).toMatchObject({
      scope: "mine",
      paymentCount: 1,
      collected: 577.5,
      net: 577.5,
      byMethod: [{ method: "CASH", count: 1, total: 577.5 }],
    });

    const branch = await api(
      "get",
      `/payments/summary?branchId=${w.branch.id}&scope=branch`,
      w.manager.token,
    );
    expect(branch.body.data).toMatchObject({ scope: "branch", paymentCount: 2, collected: 1155 });

    // A cashier asking for the whole branch still only gets their own till.
    const sneaky = await api(
      "get",
      `/payments/summary?branchId=${w.branch.id}&scope=branch`,
      w.cashier.token,
    );
    expect(sneaky.body.data.scope).toBe("mine");

    const history = await api("get", `/payments?branchId=${w.branch.id}`, w.cashier.token);
    expect(history.body.data).toHaveLength(1);
    const all = await api("get", `/payments?branchId=${w.branch.id}`, w.manager.token);
    expect(all.body.data).toHaveLength(2);
    const filtered = await api(
      "get",
      `/payments?branchId=${w.branch.id}&method=CREDIT_CARD`,
      w.manager.token,
    );
    expect(filtered.body.data).toHaveLength(1);
  });

  it("keeps money away from other roles and other branches", async () => {
    const w = await restaurant("S2");
    const other = await restaurant("S2b");
    const orderId = await billRequested(w, [w.soup.id]);
    const bill = (await generate(w, orderId)).body.data;

    for (const token of [w.waiter.token, w.kitchen.token]) {
      expect((await api("get", `/bills/${bill.id}`, token)).status).toBe(403);
      expect((await api("get", `/bills/queue?branchId=${w.branch.id}`, token)).status).toBe(403);
      expect((await api("get", `/payments?branchId=${w.branch.id}`, token)).status).toBe(403);
    }
    expect((await api("get", `/bills/${bill.id}`)).status).toBe(401);

    // A cashier from another branch can neither read nor pay it.
    expect((await api("get", `/bills/${bill.id}`, other.cashier.token)).status).toBe(403);
    expect((await pay(other, bill.id, { method: "CASH", amount: 10 })).status).toBe(403);
    expect((await generate(other, orderId)).status).toBe(403);
  });
});
