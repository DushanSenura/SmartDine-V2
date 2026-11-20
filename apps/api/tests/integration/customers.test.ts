import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actor,
  cleanupBranches,
  cleanupMenu,
  cleanupUsers,
  prisma,
  setupDatabase,
} from "./helpers";
import { api, attach, openBill, payCash, pinRates, restaurant } from "./fixtures";

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

/** A customer who has paid a bill in a fresh branch. */
async function paidCustomer(label: string) {
  const w = await restaurant(label);
  const customer = await actor("CUSTOMER");
  const { bill } = await openBill(w, [w.burger.id]); // 1155.00
  await attach(w, bill.id, customer.userId);
  const paid = (await payCash(w, bill.id, bill.total)).body.data;
  return { w, customer, bill: paid };
}

describe("customer records (CRM)", () => {
  it("shows computed visits, spend and loyalty, searchable by name, email or phone", async () => {
    const { w, customer } = await paidCustomer("C1");
    await api("patch", `/customers/${customer.userId}`, w.manager.token)
      .send({ phone: "+94 77 123 4567", notes: "Prefers the window table" })
      .expect(200);

    const detail = await api("get", `/customers/${customer.userId}`, w.manager.token);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      visitCount: 1,
      totalSpent: 1155,
      points: 11,
      phone: "+94 77 123 4567",
      notes: "Prefers the window table",
    });
    expect(detail.body.data.bills[0]).toMatchObject({ total: 1155, status: "PAID" });
    expect(detail.body.data.loyalty.transactions[0]).toMatchObject({ type: "EARN", points: 11 });
    expect(detail.body.data.lastVisit).toBeTruthy();

    for (const q of [customer.email.slice(0, 14), "4567"]) {
      const found = await api("get", `/customers?q=${encodeURIComponent(q)}`, w.manager.token);
      expect(
        found.body.data.map((c: { id: string }) => c.id),
        q,
      ).toContain(customer.userId);
    }
    const none = await api("get", "/customers?q=zzzz-nobody", w.manager.token);
    expect(none.body.data).toEqual([]);
    expect(none.body.meta).toMatchObject({ total: 0, page: 1 });
  });

  it("nets refunds off the total spent", async () => {
    const { w, customer, bill } = await paidCustomer("C2");
    await api("post", `/payments/${bill.payments[0].id}/refund`, w.cashier.token)
      .send({ amount: 155, reason: "Service issue" })
      .expect(201);
    const detail = await api("get", `/customers/${customer.userId}`, w.manager.token);
    expect(detail.body.data.totalSpent).toBe(1000);
  });

  it("includes finished stays in visits and spend", async () => {
    const w = await restaurant("C3");
    const customer = await actor("CUSTOMER");
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
    await prisma.roomBooking.create({
      data: {
        reference: `RM-IT${Date.now().toString(36).slice(-4).toUpperCase()}`,
        branchId: w.branch.id,
        roomTypeId: type.id,
        userId: customer.userId,
        guestName: "Stay Guest",
        guestEmail: "s@example.com",
        guestPhone: "+94 71 000 0000",
        checkInDate: new Date("2026-10-01T00:00:00Z"),
        checkOutDate: new Date("2026-10-03T00:00:00Z"),
        nightCount: 2,
        adultCount: 1,
        roomSubtotal: 200,
        total: 200,
        bookingStatus: "CHECKED_OUT",
      },
    });
    const detail = await api("get", `/customers/${customer.userId}`, w.manager.token);
    expect(detail.body.data).toMatchObject({ visitCount: 1, totalSpent: 200 });
    expect(detail.body.data.stays).toHaveLength(1);
  });

  it("never wipes allergies or preferences when a later edit omits them", async () => {
    const w = await restaurant("C4");
    const customer = await actor("CUSTOMER");
    await api("patch", `/customers/${customer.userId}`, w.manager.token)
      .send({
        allergies: ["peanuts", "shellfish"],
        dietaryPreferences: ["vegetarian"],
        birthday: "1990-04-02",
        preferences: "Quiet corner",
      })
      .expect(200);
    const after = await api("patch", `/customers/${customer.userId}`, w.manager.token).send({
      phone: "+94 70 111 2222",
    });
    expect(after.body.data).toMatchObject({
      allergies: ["peanuts", "shellfish"],
      dietaryPreferences: ["vegetarian"],
      birthday: "1990-04-02",
      preferences: "Quiet corner",
      phone: "+94 70 111 2222",
    });
  });

  it("keeps staff notes private and lets customers edit only their own profile", async () => {
    const w = await restaurant("C5");
    const customer = await actor("CUSTOMER");
    await api("patch", `/customers/${customer.userId}`, w.manager.token)
      .send({ notes: "Staff only" })
      .expect(200);

    const mine = await api("get", "/customers/me", customer.token);
    expect(mine.body.data.notes).toBeNull();
    const edited = await api("patch", "/customers/me", customer.token).send({
      allergies: ["gluten"],
      address: "12 Galle Road",
      notes: "sneaky", // not part of the self-service schema; ignored
    });
    expect(edited.body.data).toMatchObject({
      allergies: ["gluten"],
      address: "12 Galle Road",
      notes: null,
    });
    const asStaff = await api("get", `/customers/${customer.userId}`, w.manager.token);
    expect(asStaff.body.data.notes).toBe("Staff only");
  });

  it("looks customers up for the till with just the basics, and is closed to everyone else", async () => {
    const w = await restaurant("C6");
    const customer = await actor("CUSTOMER");
    const lookup = await api(
      "get",
      `/customers/lookup?q=${encodeURIComponent(customer.email.slice(0, 16))}`,
      w.cashier.token,
    );
    expect(lookup.status).toBe(200);
    const row = lookup.body.data.find((c: { id: string }) => c.id === customer.userId);
    expect(Object.keys(row).sort()).toEqual(["email", "id", "name", "phone", "points"]);
    expect((await api("get", "/customers/lookup?q=a", w.cashier.token)).status).toBe(400); // too short

    expect((await api("get", "/customers", w.cashier.token)).status).toBe(403); // the full list is for managers
    for (const token of [w.waiter.token, w.kitchen.token, customer.token]) {
      expect((await api("get", "/customers", token)).status).toBe(403);
      expect((await api("get", `/customers/${customer.userId}`, token)).status).toBe(403);
    }
    expect((await api("get", `/customers/lookup?q=abcd`, w.waiter.token)).status).toBe(403);
    expect((await api("get", "/customers")).status).toBe(401);
    // Staff accounts aren't customers.
    expect((await api("get", `/customers/${w.waiter.userId}`, w.manager.token)).status).toBe(404);
  });

  it("refuses to attach a non-customer to a bill", async () => {
    const w = await restaurant("C7");
    const { bill } = await openBill(w, [w.soup.id]);
    expect((await attach(w, bill.id, w.waiter.userId)).status).toBe(400);
    expect((await attach(w, bill.id, "00000000-0000-4000-8000-000000000000")).status).toBe(400);
  });
});

describe("favourites", () => {
  it("saves, lists and removes favourites, idempotently", async () => {
    const w = await restaurant("V1");
    const customer = await actor("CUSTOMER");
    const put = (id: string) => api("put", `/favourites/${id}`, customer.token);

    await put(w.burger.id).expect(200);
    await put(w.burger.id).expect(200); // saving twice is harmless
    await put(w.soup.id).expect(200);
    const list = await api("get", "/favourites", customer.token);
    expect([...list.body.data].sort()).toEqual([w.burger.id, w.soup.id].sort());

    await api("delete", `/favourites/${w.burger.id}`, customer.token).expect(200);
    await api("delete", `/favourites/${w.burger.id}`, customer.token).expect(200);
    expect((await api("get", "/favourites", customer.token)).body.data).toEqual([w.soup.id]);
  });

  it("is private to the customer and validates the dish", async () => {
    const w = await restaurant("V2");
    const a = await actor("CUSTOMER");
    const b = await actor("CUSTOMER");
    await api("put", `/favourites/${w.burger.id}`, a.token).expect(200);
    expect((await api("get", "/favourites", b.token)).body.data).toEqual([]);

    expect(
      (await api("put", "/favourites/00000000-0000-4000-8000-000000000000", a.token)).status,
    ).toBe(404);
    expect((await api("put", "/favourites/not-a-uuid", a.token)).status).toBe(400);
    expect((await api("get", "/favourites", w.waiter.token)).status).toBe(403); // customers only
    expect((await api("get", "/favourites")).status).toBe(401);
  });
});

describe("invoices", () => {
  it("lets a customer see and download their own receipts, and nobody else's", async () => {
    const { customer, bill } = await paidCustomer("I1");
    const other = await actor("CUSTOMER");

    const invoices = await api("get", "/customers/me/invoices", customer.token);
    expect(invoices.body.data).toHaveLength(1);
    expect(invoices.body.data[0]).toMatchObject({
      billId: bill.id,
      total: 1155,
      pointsEarned: 11,
      location: "Table 1",
    });
    const receiptId = invoices.body.data[0].receiptId as string;

    const receipt = await api("get", `/customers/me/receipts/${receiptId}`, customer.token);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data).toMatchObject({ total: 1155, billNumber: bill.billNumber });
    const pdf = await api("get", `/customers/me/receipts/${receiptId}/pdf`, customer.token)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    // Someone else's receipt is simply not found.
    expect((await api("get", `/customers/me/receipts/${receiptId}`, other.token)).status).toBe(404);
    expect((await api("get", `/customers/me/receipts/${receiptId}/pdf`, other.token)).status).toBe(
      404,
    );
    expect((await api("get", "/customers/me/invoices", other.token)).body.data).toEqual([]);
    expect((await api("get", "/customers/me/invoices", (await actor("WAITER")).token)).status).toBe(
      403,
    );
  });
});

describe("reviews", () => {
  it("lets a customer review a paid visit once, and publishes it", async () => {
    const { w, customer, bill } = await paidCustomer("W1");
    const reviewable = await api("get", "/reviews/reviewable", customer.token);
    expect(reviewable.body.data).toHaveLength(1);
    expect(reviewable.body.data[0]).toMatchObject({ kind: "DINING", billId: bill.id });

    const created = await api("post", "/reviews", customer.token).send({
      kind: "DINING",
      billId: bill.id,
      rating: 5,
      comment: "Lovely evening.",
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      rating: 5,
      status: "PUBLISHED",
      comment: "Lovely evening.",
    });

    const again = await api("post", "/reviews", customer.token).send({
      kind: "DINING",
      billId: bill.id,
      rating: 1,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_REVIEWED");
    expect((await api("get", "/reviews/reviewable", customer.token)).body.data).toEqual([]);
    expect((await api("get", "/reviews/mine", customer.token)).body.data).toHaveLength(1);

    const pub = await api("get", `/public/reviews?branchId=${w.branch.id}`);
    expect(pub.body.data).toMatchObject({ average: 5, count: 1 });
    // Only a first name and an initial are public.
    expect(pub.body.data.reviews[0].authorName).toBe("Test C.");
  });

  it("only accepts reviews for the customer's own paid visits", async () => {
    const { bill } = await paidCustomer("W2");
    const stranger = await actor("CUSTOMER");
    const review = (token: string, body: object) => api("post", "/reviews", token).send(body);

    expect(
      (await review(stranger.token, { kind: "DINING", billId: bill.id, rating: 1 })).status,
    ).toBe(404);

    const w = await restaurant("W2b");
    const customer = await actor("CUSTOMER");
    const unpaid = (await openBill(w, [w.soup.id])).bill;
    await attach(w, unpaid.id, customer.userId);
    expect(
      (await review(customer.token, { kind: "DINING", billId: unpaid.id, rating: 5 })).status,
    ).toBe(404);

    expect((await review(customer.token, { kind: "DINING", rating: 5 })).status).toBe(400);
    expect(
      (await review(customer.token, { kind: "STAY", billId: unpaid.id, rating: 5 })).status,
    ).toBe(400);
    expect(
      (await review(customer.token, { kind: "DINING", billId: unpaid.id, rating: 6 })).status,
    ).toBe(400);
    expect(
      (await review(customer.token, { kind: "DINING", billId: unpaid.id, rating: 0 })).status,
    ).toBe(400);
    expect(
      (await review(w.waiter.token, { kind: "DINING", billId: unpaid.id, rating: 5 })).status,
    ).toBe(403);
  });

  it("reviews a finished stay", async () => {
    const w = await restaurant("W3");
    const customer = await actor("CUSTOMER");
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
    const stay = await prisma.roomBooking.create({
      data: {
        reference: `RM-IT${Date.now().toString(36).slice(-4).toUpperCase()}`,
        branchId: w.branch.id,
        roomTypeId: type.id,
        userId: customer.userId,
        guestName: "Stay Guest",
        guestEmail: "s@example.com",
        guestPhone: "+94 71 000 0000",
        checkInDate: new Date("2026-10-01T00:00:00Z"),
        checkOutDate: new Date("2026-10-03T00:00:00Z"),
        nightCount: 2,
        adultCount: 1,
        roomSubtotal: 200,
        total: 200,
        bookingStatus: "CHECKED_OUT",
      },
    });
    const res = await api("post", "/reviews", customer.token).send({
      kind: "STAY",
      bookingId: stay.id,
      rating: 4,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe("STAY");
  });

  it("lets managers hide and reply to reviews, only within their branch", async () => {
    const { w, customer, bill } = await paidCustomer("W4");
    const other = await restaurant("W4b");
    await api("post", "/reviews", customer.token)
      .send({ kind: "DINING", billId: bill.id, rating: 2, comment: "Slow service" })
      .expect(201);

    const list = await api("get", "/reviews", w.manager.token);
    expect(list.body.data).toHaveLength(1);
    const id = list.body.data[0].id as string;
    expect(list.body.data[0].authorName).toBe("Test CUSTOMER"); // staff see the full name

    const reply = await api("patch", `/reviews/${id}`, w.manager.token).send({
      response: "Sorry — we'll do better.",
    });
    expect(reply.body.data).toMatchObject({ response: "Sorry — we'll do better." });
    expect(reply.body.data.respondedAt).toBeTruthy();
    let pub = await api("get", `/public/reviews?branchId=${w.branch.id}`);
    expect(pub.body.data.reviews[0].response).toBe("Sorry — we'll do better.");

    await api("patch", `/reviews/${id}`, w.manager.token).send({ status: "HIDDEN" }).expect(200);
    pub = await api("get", `/public/reviews?branchId=${w.branch.id}`);
    expect(pub.body.data).toMatchObject({ average: null, count: 0, reviews: [] });
    expect((await api("get", "/reviews?status=HIDDEN", w.manager.token)).body.data).toHaveLength(1);

    // Another branch's manager can't see, hide or reply to it.
    expect((await api("get", `/reviews?branchId=${w.branch.id}`, other.manager.token)).status).toBe(
      403,
    );
    expect(
      (await api("patch", `/reviews/${id}`, other.manager.token).send({ status: "PUBLISHED" }))
        .status,
    ).toBe(403);
    expect((await api("get", "/reviews", w.waiter.token)).status).toBe(403);
    expect((await api("get", "/reviews", customer.token)).status).toBe(403);
  });

  it("averages only published reviews", async () => {
    const w = await restaurant("W5");
    const give = async (rating: number, table: number) => {
      const customer = await actor("CUSTOMER");
      const { bill } = await openBill(w, [w.soup.id], table);
      await attach(w, bill.id, customer.userId);
      await payCash(w, bill.id, bill.total);
      return (
        await api("post", "/reviews", customer.token).send({
          kind: "DINING",
          billId: bill.id,
          rating,
        })
      ).body.data.id as string;
    };
    await give(5, 0);
    await give(4, 1);
    const hidden = await give(1, 2);
    await api("patch", `/reviews/${hidden}`, w.manager.token)
      .send({ status: "HIDDEN" })
      .expect(200);
    const pub = await api("get", `/public/reviews?branchId=${w.branch.id}`);
    expect(pub.body.data).toMatchObject({ average: 4.5, count: 2 });
  });
});
