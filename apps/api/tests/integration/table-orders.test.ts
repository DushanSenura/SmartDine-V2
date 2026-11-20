import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actor, cleanupBranches, cleanupUsers, prisma, setupDatabase } from "./helpers";
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

describe("customers ordering from their table", () => {
  it("reaches the kitchen, the chosen waiter and the cashier", async () => {
    const w = await restaurant("TO1");
    const customer = await actor("CUSTOMER");

    const placed = await api("post", "/table-orders", customer.token)
      .send({
        branchId: w.branch.id,
        tableNumber: " 2 ",
        waiterId: w.waiter.userId,
        kitchenInstructions: "No onions",
        items: [{ menuItemId: w.burger.id, quantity: 2, modifierIds: [] }],
      })
      .expect(201);
    expect(placed.body.data).toMatchObject({
      tableNumber: "2",
      status: "SENT_TO_KITCHEN",
      waiterId: w.waiter.userId,
      selfOrdered: true,
      subtotal: 2000,
    });

    // The kitchen has a ticket for it, and the table shows it is waiting for food.
    const tickets = await api("get", `/kitchen/tickets?branchId=${w.branch.id}`, w.kitchen.token);
    expect(tickets.body.data.map((t: { orderId: string }) => t.orderId)).toContain(
      placed.body.data.id,
    );
    const table = await prisma.restaurantTable.findUniqueOrThrow({
      where: { id: w.tables[1]!.id },
    });
    expect(table.status).toBe("WAITING_FOR_FOOD");

    // The waiter they picked is told, and so is the cashier; the kitchen hears about it too.
    const waiterHeard = await eventually(
      () => inbox(w.waiter.token),
      (b) => b.notifications.length > 0,
    );
    expect(waiterHeard.notifications[0]).toMatchObject({ type: "TABLE_ORDER_PLACED" });
    const cashierHeard = await eventually(
      () => inbox(w.cashier.token),
      (b) => b.notifications.length > 0,
    );
    expect(cashierHeard.notifications[0]).toMatchObject({ type: "TABLE_ORDER_PLACED" });
    const kitchenHeard = await eventually(
      () => inbox(w.kitchen.token),
      (b) => b.notifications.length > 0,
    );
    expect(kitchenHeard.notifications[0]).toMatchObject({ type: "ORDER_SENT_TO_KITCHEN" });

    // It continues like any order: the waiter serves it and the cashier can bill it.
    await api("post", `/kitchen/orders/${placed.body.data.id}/ready`, w.kitchen.token)
      .send({})
      .expect(200);
    await api("post", `/orders/${placed.body.data.id}/serve`, w.waiter.token).send({}).expect(200);
    await api("post", `/orders/${placed.body.data.id}/request-payment`, w.waiter.token).expect(200);
    const bill = await api("post", "/bills", w.cashier.token)
      .send({ orderId: placed.body.data.id })
      .expect(200);

    // The cashier finds the guest already selected on the bill, with no searching.
    expect(bill.body.data.customer).toMatchObject({ id: customer.userId });

    // Once the bill is paid, the invoice shows up in the customer's own account.
    expect((await api("get", "/customers/me/invoices", customer.token)).body.data).toEqual([]);
    await api("post", `/bills/${bill.body.data.id}/payments`, w.cashier.token)
      .send({ method: "CASH", amount: bill.body.data.total })
      .expect(201);
    const invoices = await api("get", "/customers/me/invoices", customer.token).expect(200);
    expect(invoices.body.data).toHaveLength(1);
    expect(invoices.body.data[0]).toMatchObject({ total: bill.body.data.total });

    // Order, bill and receipt carry the same number, so one visit is easy to match up.
    const orderNumber = placed.body.data.orderNumber as string;
    expect(bill.body.data.billNumber).toBe(`B-${orderNumber}`);
    const receipt = await prisma.receipt.findUniqueOrThrow({
      where: { billId: bill.body.data.id },
    });
    expect(receipt.receiptNumber).toBe(`R-${orderNumber}`);

    const mine = await api("get", "/table-orders/mine", customer.token).expect(200);
    expect(mine.body.data[0]).toMatchObject({ id: placed.body.data.id });
  });

  it("falls back to the table's waiter, then the quietest one", async () => {
    const w = await restaurant("TO2");
    const other = await actor("WAITER", w.branch.id);
    const customer = await actor("CUSTOMER");
    await prisma.restaurantTable.update({
      where: { id: w.tables[0]!.id },
      data: { assignedWaiterId: other.userId },
    });

    const assigned = await api("post", "/table-orders", customer.token)
      .send({
        branchId: w.branch.id,
        tableNumber: "1",
        items: [{ menuItemId: w.soup.id, quantity: 1, modifierIds: [] }],
      })
      .expect(201);
    expect(assigned.body.data.waiterId).toBe(other.userId);

    // Table 3 has nobody assigned: it goes to whichever waiter has fewer open orders (w.waiter has none).
    const quietest = await api("post", "/table-orders", customer.token)
      .send({
        branchId: w.branch.id,
        tableNumber: "3",
        items: [{ menuItemId: w.soup.id, quantity: 1, modifierIds: [] }],
      })
      .expect(201);
    expect(quietest.body.data.waiterId).toBe(w.waiter.userId);
  });

  it("rejects unknown tables, waiters from elsewhere, staff and signed-out callers", async () => {
    const w = await restaurant("TO3");
    const elsewhere = await restaurant("TO3b");
    const customer = await actor("CUSTOMER");
    const items = [{ menuItemId: w.burger.id, quantity: 1, modifierIds: [] }];

    await api("post", "/table-orders", customer.token)
      .send({ branchId: w.branch.id, tableNumber: "99", items })
      .expect(400);
    await api("post", "/table-orders", customer.token)
      .send({ branchId: w.branch.id, tableNumber: "1", waiterId: elsewhere.waiter.userId, items })
      .expect(400);
    await api("post", "/table-orders", customer.token)
      .send({ branchId: w.branch.id, tableNumber: "1", items: [] })
      .expect(400);
    await api("post", "/table-orders", w.waiter.token)
      .send({ branchId: w.branch.id, tableNumber: "1", items })
      .expect(403);
    await api("post", "/table-orders")
      .send({ branchId: w.branch.id, tableNumber: "1", items })
      .expect(401);

    // A dish from another branch can't be smuggled in.
    await api("post", "/table-orders", customer.token)
      .send({
        branchId: w.branch.id,
        tableNumber: "1",
        items: [{ menuItemId: elsewhere.burger.id, quantity: 1, modifierIds: [] }],
      })
      .expect(400);

    const lookup = await api(
      "get",
      `/table-orders/table?branchId=${w.branch.id}&tableNumber=2`,
      customer.token,
    ).expect(200);
    expect(lookup.body.data.tableNumber).toBe("2");
    await api(
      "get",
      `/table-orders/table?branchId=${w.branch.id}&tableNumber=77`,
      customer.token,
    ).expect(404);

    const waiters = await api(
      "get",
      `/table-orders/waiters?branchId=${w.branch.id}`,
      customer.token,
    ).expect(200);
    expect(waiters.body.data.map((x: { id: string }) => x.id)).toEqual([w.waiter.userId]);
  });
});
