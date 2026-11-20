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

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
});
afterAll(async () => {
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});

const api = (method: "get" | "post" | "patch" | "delete", path: string, token?: string) => {
  const req = request(app)[method](`/api/v2${path}`);
  return token ? req.set(bearer(token)) : req;
};

/** A branch with two tables, a small menu, and one of every floor role. */
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
    data: { name: `IT Mains ${label}`, slug: `it-mains-${label.toLowerCase()}-${Date.now()}` },
  });
  const dish = (name: string, price: number, extra: object = {}) =>
    prisma.menuItem.create({
      data: {
        branchId: branch.id,
        categoryId: category.id,
        name,
        slug: name.toLowerCase().replaceAll(" ", "-"),
        price,
        ...extra,
      },
    });
  const burger = await dish("Burger", 1000, {
    kitchenStation: "GRILL",
    modifiers: {
      create: [
        { name: "Extra cheese", priceDelta: 200 },
        { name: "Retired option", priceDelta: 50, isActive: false },
      ],
    },
  });
  const soup = await dish("Soup", 500, { kitchenStation: "MAIN_KITCHEN" });
  const cocktail = await dish("Cocktail", 700, { kitchenStation: "BAR" });
  const soldOut = await dish("Sold Out Pie", 400, { availability: "SOLD_OUT" });
  const waiter = await actor("WAITER", branch.id);
  const manager = await actor("MANAGER", branch.id);
  const kitchen = await actor("KITCHEN", branch.id);
  const cashier = await actor("CASHIER", branch.id);
  return { branch, tables, burger, soup, cocktail, soldOut, waiter, manager, kitchen, cashier };
}
type World = Awaited<ReturnType<typeof restaurant>>;

const line = (menuItemId: string, extra: object = {}) => ({
  menuItemId,
  quantity: 1,
  modifierIds: [],
  ...extra,
});

async function draft(w: World, items: object[], extra: object = {}, tableIndex = 0) {
  return api("post", "/orders", w.waiter.token).send({
    type: "DINE_IN",
    tableId: w.tables[tableIndex]!.id,
    guestCount: 2,
    items,
    ...extra,
  });
}

async function sendToKitchen(w: World, items: object[], tableIndex = 0) {
  const created = await draft(w, items, {}, tableIndex);
  const approved = await api("post", `/orders/${created.body.data.id}/approve`, w.waiter.token);
  return approved.body.data as {
    id: string;
    items: { id: string; name: string; status: string }[];
    status: string;
  };
}

const tableStatus = async (id: string) =>
  (await prisma.restaurantTable.findUniqueOrThrow({ where: { id } })).status;

describe("creating an order", () => {
  it("snapshots dishes, prices modifiers server-side and puts the table into ordering", async () => {
    const w = await restaurant("O1");
    const cheese = (
      await prisma.menuItemModifier.findFirstOrThrow({
        where: { menuItemId: w.burger.id, name: "Extra cheese" },
      })
    ).id;
    const res = await draft(
      w,
      [
        line(w.burger.id, { quantity: 2, modifierIds: [cheese], notes: "No onions" }),
        line(w.soup.id),
      ],
      {
        kitchenInstructions: "Guest has a nut allergy",
      },
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: "DRAFT",
      type: "DINE_IN",
      tableNumber: "1",
      subtotal: 2 * 1200 + 500,
      kitchenInstructions: "Guest has a nut allergy",
    });
    expect(res.body.data.orderNumber).toMatch(/^\d{8}-\d{3}$/);
    const burger = res.body.data.items.find((i: { name: string }) => i.name === "Burger");
    expect(burger).toMatchObject({
      unitPrice: 1200,
      lineTotal: 2400,
      notes: "No onions",
      station: "GRILL",
      status: "PENDING",
    });
    expect(burger.modifiers).toEqual([{ name: "Extra cheese", priceDelta: 200 }]);
    expect(await tableStatus(w.tables[0]!.id)).toBe("ORDERING");

    // Later menu edits do not change the order.
    await prisma.menuItem.update({
      where: { id: w.burger.id },
      data: { price: 9999, name: "Renamed" },
    });
    const again = await api("get", `/orders/${res.body.data.id}`, w.waiter.token);
    expect(again.body.data.items.find((i: { id: string }) => i.id === burger.id)).toMatchObject({
      name: "Burger",
      unitPrice: 1200,
    });
    expect(again.body.data.history[0]).toMatchObject({ toStatus: "DRAFT" });
  });

  it("rejects unavailable dishes, bad options, foreign items and invalid targets", async () => {
    const w = await restaurant("O2");
    const other = await restaurant("O2b");
    const retired = (
      await prisma.menuItemModifier.findFirstOrThrow({
        where: { menuItemId: w.burger.id, name: "Retired option" },
      })
    ).id;

    expect((await draft(w, [line(w.soldOut.id)])).body.error.code).toBe("ITEM_UNAVAILABLE");
    expect((await draft(w, [line(w.burger.id, { modifierIds: [retired] })])).status).toBe(400); // inactive option
    expect(
      (
        await draft(w, [
          line(w.burger.id, { modifierIds: ["00000000-0000-4000-8000-000000000000"] }),
        ])
      ).status,
    ).toBe(400);
    expect((await draft(w, [line(other.soup.id)])).status).toBe(400); // another branch's dish
    expect((await draft(w, [line(w.soup.id, { quantity: 0 })])).status).toBe(400);
    expect((await draft(w, [line(w.soup.id, { quantity: 999 })])).status).toBe(400);
    expect(
      (await api("post", "/orders", w.waiter.token).send({ type: "DINE_IN", items: [] })).status,
    ).toBe(400); // no table
    expect(
      (
        await api("post", "/orders", w.waiter.token).send({
          type: "DINE_IN",
          tableId: w.tables[0]!.id,
          roomId: w.tables[0]!.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("post", "/orders", w.waiter.token).send({
          type: "DINE_IN",
          tableId: other.tables[0]!.id,
          items: [],
        })
      ).status,
    ).toBe(400);

    await prisma.restaurantTable.update({
      where: { id: w.tables[1]!.id },
      data: { status: "OUT_OF_SERVICE" },
    });
    expect((await draft(w, [line(w.soup.id)], {}, 1)).body.error.code).toBe("TABLE_OUT_OF_SERVICE");
  });

  it("numbers simultaneous orders uniquely", async () => {
    const w = await restaurant("O3");
    const results = await Promise.all(Array.from({ length: 6 }, () => draft(w, [line(w.soup.id)])));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.body.data.orderNumber).sort();
    expect(new Set(numbers).size).toBe(6);
    expect(numbers.map((n) => Number(n.slice(-3)))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("edits a draft: quantities, removal, guest details", async () => {
    const w = await restaurant("O4");
    const created = await draft(w, [line(w.soup.id)]);
    const id = created.body.data.id;
    const itemId = created.body.data.items[0].id;

    const edited = await api("patch", `/orders/${id}/items/${itemId}`, w.waiter.token).send({
      quantity: 3,
      notes: "Hot",
    });
    expect(edited.body.data.subtotal).toBe(1500);
    const added = await api("post", `/orders/${id}/items`, w.waiter.token).send({
      items: [line(w.cocktail.id)],
    });
    expect(added.body.data.subtotal).toBe(2200);
    const updated = await api("patch", `/orders/${id}`, w.waiter.token).send({
      guestName: "Ada",
      guestCount: 4,
    });
    expect(updated.body.data).toMatchObject({ guestName: "Ada", guestCount: 4 });
    const removed = await api("post", `/orders/${id}/items/${itemId}/cancel`, w.waiter.token).send(
      {},
    );
    expect(removed.body.data.subtotal).toBe(700);
    expect(removed.body.data.items).toHaveLength(1);
  });
});

describe("approval, kitchen and serving", () => {
  it("runs the whole lifecycle with live table status", async () => {
    const w = await restaurant("W1");
    const created = await draft(w, [line(w.burger.id), line(w.soup.id)]);
    const id = created.body.data.id;
    const kitchenTickets = async () =>
      (await api("get", `/kitchen/tickets?branchId=${w.branch.id}`, w.kitchen.token)).body.data;

    // Not visible to the kitchen until approved.
    await api("post", `/orders/${id}/submit`, w.waiter.token).expect(200);
    expect((await api("get", `/orders/${id}`, w.manager.token)).body.data.status).toBe(
      "PENDING_APPROVAL",
    );
    expect(await kitchenTickets()).toEqual([]);
    await api("post", `/orders/${id}/approve`, w.manager.token).expect(200);
    expect(await tableStatus(w.tables[0]!.id)).toBe("WAITING_FOR_FOOD");

    // The kitchen sees a ticket with no money on it.
    const tickets = await kitchenTickets();
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      location: "Table 1",
      status: "SENT_TO_KITCHEN",
      priority: "NORMAL",
    });
    expect(JSON.stringify(tickets)).not.toMatch(/price|subtotal|total|currency/i);
    const [burger, soup] = ["Burger", "Soup"].map((n) =>
      tickets[0].items.find((i: { name: string }) => i.name === n),
    );

    // Station filter.
    const grill = (
      await api("get", `/kitchen/tickets?branchId=${w.branch.id}&station=GRILL`, w.kitchen.token)
    ).body.data;
    expect(grill[0].items.map((i: { name: string }) => i.name)).toEqual(["Burger"]);
    expect(
      (await api("get", `/kitchen/tickets?branchId=${w.branch.id}&station=BAR`, w.kitchen.token))
        .body.data,
    ).toEqual([]);

    const setItem = (itemId: string, status: string) =>
      api("patch", `/kitchen/items/${itemId}/status`, w.kitchen.token).send({ status });
    const orderStatus = async () =>
      (await api("get", `/orders/${id}`, w.waiter.token)).body.data.status;

    await setItem(burger.id, "PREPARING").expect(200);
    expect(await orderStatus()).toBe("PREPARING");
    await setItem(burger.id, "PREPARING").expect(409); // already preparing
    await setItem(burger.id, "PREPARED").expect(200);
    expect(await orderStatus()).toBe("PARTIALLY_READY");

    // Nothing is served yet; the waiter cannot request the bill.
    await api("post", `/orders/${id}/request-payment`, w.waiter.token).expect(409);
    await api("post", `/orders/${id}/serve`, w.waiter.token)
      .send({ itemIds: [soup.id] })
      .expect(409); // soup not ready

    await setItem(soup.id, "PREPARED").expect(200);
    expect(await orderStatus()).toBe("READY_TO_SERVE");

    const first = await api("post", `/orders/${id}/serve`, w.waiter.token).send({
      itemIds: [burger.id],
    });
    expect(first.body.data.status).toBe("PARTIALLY_SERVED");
    expect(await tableStatus(w.tables[0]!.id)).toBe("DINING");
    const second = await api("post", `/orders/${id}/serve`, w.waiter.token).send({});
    expect(second.body.data.status).toBe("SERVED");
    expect(second.body.data.servedAt).toBeTruthy();

    const bill = await api("post", `/orders/${id}/request-payment`, w.waiter.token);
    expect(bill.body.data.status).toBe("PAYMENT_REQUESTED");
    expect(await tableStatus(w.tables[0]!.id)).toBe("PAYMENT_PENDING");
    expect(await kitchenTickets()).toEqual([]);

    const history = (await api("get", `/orders/${id}`, w.waiter.token)).body.data.history.map(
      (h: { toStatus: string }) => h.toStatus,
    );
    expect(history).toEqual(
      expect.arrayContaining([
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED",
        "SENT_TO_KITCHEN",
        "PREPARING",
        "PARTIALLY_READY",
        "READY_TO_SERVE",
        "PARTIALLY_SERVED",
        "SERVED",
        "PAYMENT_REQUESTED",
      ]),
    );
  });

  it("lets the kitchen recall a ready dish and mark a whole ticket ready", async () => {
    const w = await restaurant("W2");
    const order = await sendToKitchen(w, [line(w.burger.id), line(w.soup.id), line(w.cocktail.id)]);
    const [burger] = order.items;
    await api("patch", `/kitchen/items/${burger!.id}/status`, w.kitchen.token)
      .send({ status: "PREPARED" })
      .expect(200);
    await api("patch", `/kitchen/items/${burger!.id}/status`, w.kitchen.token)
      .send({ status: "PREPARING" })
      .expect(200); // recall

    // A station can finish its own dishes only.
    await api("post", `/kitchen/orders/${order.id}/ready`, w.kitchen.token)
      .send({ station: "BAR" })
      .expect(200);
    let state = (await api("get", `/orders/${order.id}`, w.waiter.token)).body.data;
    expect(
      state.items
        .filter((i: { status: string }) => i.status === "PREPARED")
        .map((i: { name: string }) => i.name),
    ).toEqual(["Cocktail"]);
    expect(state.status).toBe("PARTIALLY_READY");

    await api("post", `/kitchen/orders/${order.id}/ready`, w.kitchen.token).send({}).expect(200);
    state = (await api("get", `/orders/${order.id}`, w.waiter.token)).body.data;
    expect(state.status).toBe("READY_TO_SERVE");
    await api("post", `/kitchen/orders/${order.id}/ready`, w.kitchen.token).send({}).expect(409); // nothing left
  });

  it("handles simultaneous kitchen / serving actions without double-applying", async () => {
    const w = await restaurant("W3");
    const order = await sendToKitchen(w, [line(w.soup.id)]);
    const item = order.items[0]!;
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        api("patch", `/kitchen/items/${item.id}/status`, w.kitchen.token).send({
          status: "PREPARED",
        }),
      ),
    );
    // Only one request moves it from PENDING; the rest see it already prepared.
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);

    const serves = await Promise.all(
      [1, 2, 3].map(() => api("post", `/orders/${order.id}/serve`, w.waiter.token).send({})),
    );
    expect(serves.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await api("get", `/orders/${order.id}`, w.waiter.token)).body.data.status).toBe(
      "SERVED",
    );
  });

  it("returns a rejected order to draft with the reason recorded", async () => {
    const w = await restaurant("W4");
    const created = await draft(w, [line(w.soup.id)]);
    const id = created.body.data.id;
    await api("post", `/orders/${id}/submit`, w.waiter.token).expect(200);
    await api("post", `/orders/${id}/submit`, w.waiter.token).expect(409); // already submitted
    await api("post", `/orders/${id}/reject`, w.manager.token)
      .send({ reason: "Check the table number" })
      .expect(200);
    const order = (await api("get", `/orders/${id}`, w.waiter.token)).body.data;
    expect(order.status).toBe("DRAFT");
    expect(order.history.at(-1)).toMatchObject({
      toStatus: "DRAFT",
      note: "Check the table number",
    });
    await api("post", `/orders/${id}/reject`, w.manager.token).send({}).expect(409); // not pending
  });

  it("cannot submit or send an empty order", async () => {
    const w = await restaurant("W5");
    const created = await draft(w, []);
    await api("post", `/orders/${created.body.data.id}/submit`, w.waiter.token).expect(400);
    await api("post", `/orders/${created.body.data.id}/approve`, w.waiter.token).expect(400);
  });
});

describe("changing an order in the kitchen", () => {
  it("adds a second round that re-opens a ready order and gets its own timer", async () => {
    const w = await restaurant("C1");
    const order = await sendToKitchen(w, [line(w.soup.id)]);
    await api("post", `/kitchen/orders/${order.id}/ready`, w.kitchen.token).send({}).expect(200);
    expect((await api("get", `/orders/${order.id}`, w.waiter.token)).body.data.status).toBe(
      "READY_TO_SERVE",
    );

    const more = await api("post", `/orders/${order.id}/items`, w.waiter.token).send({
      items: [line(w.cocktail.id)],
    });
    expect(more.status).toBe(201);
    expect(more.body.data.status).toBe("PARTIALLY_READY");
    expect(more.body.data.items.find((i: { name: string }) => i.name === "Cocktail").round).toBe(2);
    const tickets = (await api("get", `/kitchen/tickets?branchId=${w.branch.id}`, w.kitchen.token))
      .body.data;
    expect(
      tickets[0].items.map((i: { name: string; round: number }) => `${i.name}:${i.round}`),
    ).toEqual(["Soup:1", "Cocktail:2"]);

    // People who cannot take orders cannot add dishes.
    await api("post", `/orders/${order.id}/items`, w.cashier.token)
      .send({ items: [line(w.soup.id)] })
      .expect(403);
    await api("post", `/orders/${order.id}/items`, w.kitchen.token)
      .send({ items: [line(w.soup.id)] })
      .expect(403);
  });

  it("restricts cancelling dishes that the kitchen has started", async () => {
    const w = await restaurant("C2");
    const order = await sendToKitchen(w, [line(w.burger.id), line(w.soup.id)]);
    const [burger, soup] = order.items;

    await api("patch", `/kitchen/items/${burger!.id}/status`, w.kitchen.token)
      .send({ status: "PREPARING" })
      .expect(200);
    // Waiters cannot pull a dish that is already being cooked; managers can.
    await api("post", `/orders/${order.id}/items/${burger!.id}/cancel`, w.waiter.token)
      .send({})
      .expect(403);
    await api("post", `/orders/${order.id}/items/${soup!.id}/cancel`, w.waiter.token)
      .send({ reason: "Changed mind" })
      .expect(200);
    const manager = await api(
      "post",
      `/orders/${order.id}/items/${burger!.id}/cancel`,
      w.manager.token,
    ).send({ reason: "Spilled" });
    expect(manager.status).toBe(200);
    // Every dish cancelled: the order itself is cancelled and the table is released.
    expect(manager.body.data.status).toBe("CANCELLED");
    expect(await tableStatus(w.tables[0]!.id)).toBe("OCCUPIED");
  });

  it("lets anyone cancel before the kitchen starts, but only managers void afterwards", async () => {
    const w = await restaurant("C3");
    const early = await sendToKitchen(w, [line(w.soup.id)], 0);
    const cancelled = await api("post", `/orders/${early.id}/cancel`, w.waiter.token).send({
      reason: "Walked out",
    });
    expect(cancelled.body.data.status).toBe("CANCELLED");
    expect(
      cancelled.body.data.items.every((i: { status: string }) => i.status === "CANCELLED"),
    ).toBe(true);
    await api("post", `/orders/${early.id}/cancel`, w.waiter.token).send({}).expect(409); // already closed

    const late = await sendToKitchen(w, [line(w.soup.id)], 1);
    await api("patch", `/kitchen/items/${late.items[0]!.id}/status`, w.kitchen.token)
      .send({ status: "PREPARING" })
      .expect(200);
    await api("post", `/orders/${late.id}/cancel`, w.waiter.token).send({}).expect(403);
    const voided = await api("post", `/orders/${late.id}/cancel`, w.manager.token).send({
      reason: "Kitchen fire",
    });
    expect(voided.body.data.status).toBe("VOID");
    expect(
      (await api("get", `/kitchen/tickets?branchId=${w.branch.id}`, w.kitchen.token)).body.data,
    ).toEqual([]);
  });
});

describe("room service", () => {
  it("orders for a checked-in guest and refuses empty or unrelated rooms", async () => {
    const w = await restaurant("R1");
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
      data: { branchId: w.branch.id, roomTypeId: type.id, roomNumber: "201" },
    });
    const empty = await prisma.room.create({
      data: { branchId: w.branch.id, roomTypeId: type.id, roomNumber: "202" },
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

    const res = await api("post", "/orders", w.waiter.token).send({
      type: "ROOM_SERVICE",
      roomId: room.id,
      items: [line(w.soup.id)],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: "ROOM_SERVICE",
      roomNumber: "201",
      guestName: "Grace Hopper",
      tableId: null,
    });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: res.body.data.id } })).roomBookingId,
    ).toBe(stay.id);

    await api("post", `/orders/${res.body.data.id}/approve`, w.waiter.token).expect(200);
    const tickets = (await api("get", `/kitchen/tickets?branchId=${w.branch.id}`, w.kitchen.token))
      .body.data;
    expect(tickets[0].location).toBe("Room 201");

    const refused = await api("post", "/orders", w.waiter.token).send({
      type: "ROOM_SERVICE",
      roomId: empty.id,
      items: [],
    });
    expect(refused.body.error.code).toBe("ROOM_NOT_OCCUPIED");
  });
});

describe("permissions and branch isolation", () => {
  it("keeps the kitchen away from orders and money, and everyone else away from the kitchen", async () => {
    const w = await restaurant("P1");
    const order = await sendToKitchen(w, [line(w.soup.id)]);
    const customer = await actor("CUSTOMER");

    for (const t of [w.kitchen.token, customer.token]) {
      await api("get", `/orders?branchId=${w.branch.id}`, t).expect(403);
      await api("get", `/orders/${order.id}`, t).expect(403);
      await api("post", "/orders", t)
        .send({ type: "DINE_IN", tableId: w.tables[0]!.id, items: [] })
        .expect(403);
    }
    for (const t of [w.waiter.token, w.cashier.token, customer.token]) {
      if (t === w.waiter.token) {
        // Waiters can see and serve, but do not operate the kitchen.
        await api("get", `/kitchen/tickets?branchId=${w.branch.id}`, t).expect(403);
      } else {
        await api("get", `/kitchen/tickets?branchId=${w.branch.id}`, t).expect(403);
      }
      await api("patch", `/kitchen/items/${order.items[0]!.id}/status`, t)
        .send({ status: "PREPARED" })
        .expect(403);
    }
    // The cashier can read orders but not create, approve or serve them.
    await api("get", `/orders?branchId=${w.branch.id}`, w.cashier.token).expect(200);
    await api("post", "/orders", w.cashier.token)
      .send({ type: "DINE_IN", tableId: w.tables[0]!.id, items: [] })
      .expect(403);
    await api("post", `/orders/${order.id}/serve`, w.cashier.token).send({}).expect(403);
    await api("get", `/kitchen/tickets?branchId=${w.branch.id}`, w.manager.token).expect(200);
    await api("get", "/orders", undefined).expect(401);
  });

  it("isolates branches", async () => {
    const a = await restaurant("P2");
    const b = await restaurant("P2b");
    const order = await sendToKitchen(a, [line(a.soup.id)]);

    await api("get", `/orders/${order.id}`, b.waiter.token).expect(403);
    await api("get", `/orders?branchId=${a.branch.id}`, b.waiter.token).expect(403);
    await api("post", `/orders/${order.id}/cancel`, b.manager.token).send({}).expect(403);
    await api("post", `/orders/${order.id}/items`, b.waiter.token)
      .send({ items: [line(b.soup.id)] })
      .expect(403);
    await api("get", `/kitchen/tickets?branchId=${a.branch.id}`, b.kitchen.token).expect(403);
    await api("patch", `/kitchen/items/${order.items[0]!.id}/status`, b.kitchen.token)
      .send({ status: "PREPARED" })
      .expect(403);
    await api("post", `/kitchen/orders/${order.id}/ready`, b.kitchen.token).send({}).expect(403);
    // Another branch's tickets never leak into this one's.
    expect(
      (await api("get", `/kitchen/tickets?branchId=${b.branch.id}`, b.kitchen.token)).body.data,
    ).toEqual([]);
  });
});

describe("menu modifiers", () => {
  it("are managed with the dish, replaced on update, and hidden from guests when inactive", async () => {
    const w = await restaurant("M1");
    const category = await prisma.menuCategory.findFirstOrThrow({
      where: { items: { some: { branchId: w.branch.id } } },
    });
    const created = await api("post", "/menu/items", w.manager.token).send({
      branchId: w.branch.id,
      categoryId: category.id,
      name: "Steak",
      price: 5000,
      modifiers: [
        { name: "Medium", priceDelta: 0 },
        { name: "Peppercorn sauce", priceDelta: 250 },
        { name: "Hidden", priceDelta: 1, isActive: false },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.modifiers).toHaveLength(3); // managers see inactive ones too

    const publicView = await api("get", `/menu/items/steak?branchId=${w.branch.id}`);
    expect(publicView.body.data.item.modifiers.map((m: { name: string }) => m.name)).toEqual([
      "Medium",
      "Peppercorn sauce",
    ]);

    const updated = await api("patch", `/menu/items/${created.body.data.id}`, w.manager.token).send(
      { modifiers: [{ name: "Rare", priceDelta: 0 }] },
    );
    expect(updated.body.data.modifiers.map((m: { name: string }) => m.name)).toEqual(["Rare"]);
    await api("patch", `/menu/items/${created.body.data.id}`, w.manager.token)
      .send({ price: 5100 })
      .expect(200); // modifiers untouched
    expect(
      (await api("get", `/menu/admin?branchId=${w.branch.id}`, w.manager.token)).body.data.find(
        (i: { name: string }) => i.name === "Steak",
      ).modifiers,
    ).toHaveLength(1);
  });
});
