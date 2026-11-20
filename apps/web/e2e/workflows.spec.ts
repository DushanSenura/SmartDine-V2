import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import { API, apiToken, auth, resetFloor, signIn, type Table } from "./helpers";

/**
 * The four journeys the product exists for, each followed from its first step to its last in one test.
 * People act through the real screens where a person would; setup and "waiting for the kitchen" steps use
 * the API. Every hand-off asserts the state the next role will see.
 */
test.describe.configure({ mode: "serial" });

const SEVEN_PM = /^7:00\sPM$/;
const unique = () => Date.now().toString(36);
const plusDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Today's date at the demo branch (Colombo), which is not always the machine's UTC date. */
const branchToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

const dish = async (request: APIRequestContext, branchId: string) => {
  const menu = (await (await request.get(`${API}/menu?branchId=${branchId}`)).json()).data
    .items as { id: string; isAvailableNow: boolean; modifiers: unknown[] }[];
  return menu.find((m) => m.isAvailableNow && m.modifiers.length === 0)!;
};

async function get<T>(request: APIRequestContext, path: string, token: string): Promise<T> {
  const res = await request.get(`${API}${path}`, { headers: auth(token) });
  expect(res.ok(), `${path} → ${res.status()}`).toBeTruthy();
  return (await res.json()).data as T;
}

async function send(
  request: APIRequestContext,
  method: "post" | "patch",
  path: string,
  token: string,
  data: object = {},
) {
  const res = await request[method](`${API}${path}`, { headers: auth(token), data });
  const body = await res.json();
  expect(
    res.ok(),
    `${method.toUpperCase()} ${path} → ${res.status()} ${JSON.stringify(body)}`,
  ).toBeTruthy();
  return body.data;
}

async function page(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await context.newPage();
  await signIn(p, email);
  return p;
}

test.afterAll(async ({ request }) => {
  await resetFloor(request);
  // Any stay this file left in house is checked out, so the demo hotel is as we found it.
  const manager = await apiToken(request, "manager@smartdine.test");
  const bookings = await get<{ id: string; status: string; guestName: string }[]>(
    request,
    "/room-bookings",
    manager,
  );
  for (const b of bookings.filter((b) => b.guestName.startsWith("Flow "))) {
    if (b.status === "CHECKED_IN") {
      await send(request, "patch", `/room-bookings/${b.id}/status`, manager, {
        status: "CHECKED_OUT",
      });
    } else if (b.status === "CONFIRMED" || b.status === "PENDING") {
      await send(request, "patch", `/room-bookings/${b.id}/status`, manager, {
        status: "CANCELLED",
      });
    }
  }
  const rooms = await get<{ id: string; housekeepingStatus: string }[]>(request, "/rooms", manager);
  for (const room of rooms.filter((r) => r.housekeepingStatus !== "CLEAN")) {
    await send(request, "patch", `/housekeeping/rooms/${room.id}`, manager, {
      housekeepingStatus: "CLEAN",
    });
  }
});

test("restaurant customer: home → menu → reservation → confirmation → visit", async ({
  browser,
}) => {
  const guest = `Flow Diner ${unique()}`;
  const customer = await page(browser, "customer@smartdine.test");

  await customer.goto("/");
  await expect(customer.getByRole("heading", { level: 1 })).toContainText("A table, a celebration");
  const nav = customer.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Menu" }).click();
  await expect(customer.getByRole("heading", { name: "Made to be shared" })).toBeVisible();
  await nav.getByRole("link", { name: "Reservations" }).click();
  await expect(customer.getByRole("heading", { name: "Reserve a table" })).toBeVisible();

  // The form opens on tomorrow; two more days is always outside the cancellation window, whatever time
  // this runs (staff pages open on today, so they click three times to reach the same day).
  for (let i = 0; i < 2; i++) await customer.getByRole("button", { name: "Next day" }).click();
  await customer.getByRole("button", { name: SEVEN_PM }).click();
  await customer.getByRole("button", { name: "Continue" }).click();
  await customer.getByRole("button", { name: "Continue" }).click();
  await customer.getByLabel("Full name").fill(guest);
  await customer.getByLabel("Phone").fill("+94 77 123 4567");
  await customer.getByLabel("Email").fill("flow.diner@example.com");
  await customer.getByRole("button", { name: "Review booking" }).click();
  await customer.getByRole("button", { name: "Confirm reservation" }).click();

  // Confirmation, then the booking is in the customer's account and on the staff list.
  await expect(customer.getByRole("heading", { name: "You're booked" })).toBeVisible();
  const reference = (await customer.getByText(/^SD-[A-Z2-9]{6}$/).textContent())!.trim();
  await customer.getByRole("link", { name: "View my reservations" }).click();
  const card = customer.getByRole("listitem").filter({ hasText: reference });
  await expect(card.getByText("Confirmed")).toBeVisible();

  // The visit: the host checks the party in and seats them.
  const waiter = await page(browser, "waiter@smartdine.test");
  await waiter.getByRole("link", { name: "Reservations" }).click();
  for (let i = 0; i < 3; i++) await waiter.getByRole("button", { name: "Next day" }).click();
  const row = waiter.getByRole("listitem").filter({ hasText: guest });
  await expect(row.getByText("Confirmed")).toBeVisible();
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
  await row.getByRole("button", { name: "Seat" }).click();
  await expect(row.getByText("Seated")).toBeVisible();
  await row.getByRole("button", { name: "Complete" }).click();
  await expect(row.getByText("Completed")).toBeVisible();

  await customer.reload();
  await expect(
    customer.getByRole("listitem").filter({ hasText: reference }).getByText("Completed"),
  ).toBeVisible();
});

test("restaurant operation: order → approval → kitchen → serve → bill → payment → receipt → table cleaned", async ({
  browser,
  request,
}) => {
  const [waiterToken, kitchenToken, managerToken] = await Promise.all([
    apiToken(request, "waiter@smartdine.test"),
    apiToken(request, "kitchen@smartdine.test"),
    apiToken(request, "manager@smartdine.test"),
  ]);
  const tables = await get<Table[]>(request, "/tables", managerToken);
  const table = tables.find((t) => t.status === "AVAILABLE")!;
  const tableStatus = async () =>
    (await get<Table[]>(request, "/tables", managerToken)).find((t) => t.id === table.id)!.status;
  const orderStatus = async (id: string) =>
    (await get<{ status: string }>(request, `/orders/${id}`, waiterToken)).status;
  const item = await dish(request, table.branchId);

  // The waiter opens an order for the (now occupied) table.
  const order = await send(request, "post", "/orders", waiterToken, {
    type: "DINE_IN",
    tableId: table.id,
    guestName: "Flow Party",
    items: [{ menuItemId: item.id, quantity: 2, modifierIds: [] }],
  });
  expect(await orderStatus(order.id)).toBe("DRAFT");
  expect(await tableStatus()).toBe("ORDERING");

  // Submitted → approved by a manager → on the kitchen's board, live.
  const kitchen = await page(browser, "kitchen@smartdine.test");
  await send(request, "post", `/orders/${order.id}/submit`, waiterToken);
  expect(await orderStatus(order.id)).toBe("PENDING_APPROVAL");
  await send(request, "post", `/orders/${order.id}/approve`, managerToken);
  expect(await orderStatus(order.id)).toBe("SENT_TO_KITCHEN");
  expect(await tableStatus()).toBe("WAITING_FOR_FOOD");
  await expect(kitchen.getByText(order.orderNumber).first()).toBeVisible();

  // Preparation → ready → served.
  const detail = await get<{ items: { id: string }[] }>(
    request,
    `/orders/${order.id}`,
    waiterToken,
  );
  for (const line of detail.items) {
    await send(request, "patch", `/kitchen/items/${line.id}/status`, kitchenToken, {
      status: "PREPARING",
    });
  }
  expect(await orderStatus(order.id)).toBe("PREPARING");
  await send(request, "post", `/kitchen/orders/${order.id}/ready`, kitchenToken);
  expect(await orderStatus(order.id)).toBe("READY_TO_SERVE");
  await send(request, "post", `/orders/${order.id}/serve`, waiterToken);
  expect(await orderStatus(order.id)).toBe("SERVED");
  expect(await tableStatus()).toBe("DINING");

  // Payment requested → the cashier takes it at the till.
  await send(request, "post", `/orders/${order.id}/request-payment`, waiterToken);
  expect(await orderStatus(order.id)).toBe("PAYMENT_REQUESTED");
  expect(await tableStatus()).toBe("PAYMENT_PENDING");

  const cashier = await page(browser, "cashier@smartdine.test");
  await cashier.getByRole("button", { name: `Open bill for Table ${table.tableNumber}` }).click();
  await expect(cashier.getByRole("heading", { level: 1, name: /^Bill B-/ })).toBeVisible();
  const payment = cashier.getByRole("form", { name: "Take payment" });
  await payment.getByLabel("Payment method").selectOption("CREDIT_CARD");
  await payment.getByLabel("Reference (optional)").fill("FLOW-1001");
  await payment.getByRole("button", { name: /^Take / }).click();
  await expect(cashier.getByLabel("Balance due")).toHaveText(/^LKR\s0$/);
  await expect(cashier.getByRole("form", { name: "Take payment" })).toHaveCount(0);

  // Receipt issued, order completed, table sent to cleaning.
  expect(await orderStatus(order.id)).toBe("COMPLETED");
  expect(await tableStatus()).toBe("CLEANING");
  await cashier
    .getByRole("link", { name: /receipt/i })
    .first()
    .click();
  await expect(cashier).toHaveURL(/\/app\/receipts\//);
  await expect(cashier.getByRole("heading", { level: 1, name: /^Receipt / })).toBeVisible();

  // Staff clean the table and it is available again.
  await send(request, "patch", `/tables/${table.id}/status`, waiterToken, { status: "AVAILABLE" });
  expect(await tableStatus()).toBe("AVAILABLE");
});

test("accommodation: search → book → check-in → room service → stay → checkout → final bill → housekeeping → available", async ({
  browser,
  request,
}) => {
  const guest = `Flow Guest ${unique()}`;
  const checkIn = branchToday();
  const checkOut = plusDays(checkIn, 1);
  const [waiterToken, kitchenToken, managerToken, cashierToken] = await Promise.all([
    apiToken(request, "waiter@smartdine.test"),
    apiToken(request, "kitchen@smartdine.test"),
    apiToken(request, "manager@smartdine.test"),
    apiToken(request, "cashier@smartdine.test"),
  ]);

  // The guest searches dates, picks a room and books it.
  const customer = await page(browser, "customer@smartdine.test");
  await customer.goto(`/rooms?checkIn=${checkIn}&checkOut=${checkOut}&adults=2&children=0`);
  await expect(customer.getByRole("heading", { level: 1, name: "Stay with us" })).toBeVisible();
  await customer
    .getByRole("listitem")
    .filter({ hasText: "Standard Room" })
    .getByRole("link", { name: "Details" })
    .click();
  await customer.getByRole("link", { name: "Book this room" }).click();
  await customer.getByRole("button", { name: "Continue" }).click();
  await customer.getByLabel("Full name").fill(guest);
  await customer.getByLabel("Phone").fill("+94 77 123 4567");
  await customer.getByLabel("Email").fill("flow.guest@example.com");
  await customer.getByRole("button", { name: "Review booking" }).click();
  await customer.getByRole("button", { name: "Confirm booking" }).click();
  await expect(customer.getByRole("heading", { name: "Your room is booked" })).toBeVisible();

  // Front desk checks the guest in.
  const desk = await page(browser, "manager@smartdine.test");
  await desk.getByRole("link", { name: "Room bookings" }).click();
  const row = desk.getByRole("listitem").filter({ hasText: guest });
  await expect(row.getByText("Confirmed")).toBeVisible();
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
  const roomNumber = /Room (\d+)/.exec((await row.textContent()) ?? "")![1]!;

  // Room service: ordered by the waiter, cooked, served, and charged to the room.
  const rooms = await get<{ id: string; roomNumber: string; branchId: string }[]>(
    request,
    "/rooms",
    managerToken,
  );
  const room = rooms.find((r) => r.roomNumber === roomNumber)!;
  const item = await dish(request, room.branchId);
  const order = await send(request, "post", "/orders", waiterToken, {
    type: "ROOM_SERVICE",
    roomId: room.id,
    items: [{ menuItemId: item.id, quantity: 1, modifierIds: [] }],
  });
  await send(request, "post", `/orders/${order.id}/submit`, waiterToken);
  await send(request, "post", `/orders/${order.id}/approve`, managerToken);
  await send(request, "post", `/kitchen/orders/${order.id}/ready`, kitchenToken);
  await send(request, "post", `/orders/${order.id}/serve`, waiterToken);
  await send(request, "post", `/orders/${order.id}/request-payment`, waiterToken);
  const bill = await send(request, "post", "/bills", cashierToken, { orderId: order.id });
  const paid = await send(request, "post", `/bills/${bill.id}/payments`, cashierToken, {
    method: "ROOM_CHARGE",
    amount: bill.total,
  });
  expect(paid.status).toBe("PAID");

  // During the stay the charge is on the guest's folio; the desk sees it as "Room charges".
  await row.getByRole("button", { name: "Room charges" }).click();
  const folio = desk.getByRole("dialog", { name: "Room charges" });
  await expect(folio.getByText(order.orderNumber)).toBeVisible();
  await desk.keyboard.press("Escape");
  await expect(desk.getByRole("dialog")).toHaveCount(0);

  // Checkout produces the final bill (the folio total) and a cleaning task.
  await row.getByRole("button", { name: "Check out" }).click();
  await expect(row.getByText("Checked out")).toBeVisible();
  const booking = (
    await get<{ id: string; guestName: string }[]>(request, "/room-bookings", managerToken)
  ).find((b) => b.guestName === guest)!;
  const finalBill = await get<{ total: number; charges: unknown[] }>(
    request,
    `/folios/${booking.id}`,
    managerToken,
  );
  expect(finalBill.charges).toHaveLength(1);
  expect(finalBill.total).toBe(bill.total);

  // Housekeeping cleans the room and it is available again.
  await desk.getByRole("link", { name: "Housekeeping" }).click();
  const task = desk
    .getByRole("listitem")
    .filter({ hasText: `Room ${roomNumber} · Check-out clean` });
  await expect(task).toBeVisible();
  await task.getByRole("button", { name: "Mark clean" }).click();
  await expect(task).toHaveCount(0);
  await desk.getByRole("link", { name: "Room inventory" }).click();
  const tile = desk.getByRole("listitem").filter({ hasText: new RegExp(`^${roomNumber}(?!\\d)`) });
  await expect(tile.locator("span").filter({ hasText: /^Available$/ })).toBeVisible();
});

test("management: the owner works through every part of the business", async ({ browser }) => {
  const owner = await page(browser, "owner@smartdine.test");
  await expect(owner.getByRole("heading", { level: 1, name: "Owner dashboard" })).toBeVisible();

  const stops: [string, RegExp][] = [
    ["Branches", /\/app\/branches$/],
    ["Staff", /\/app\/staff$/],
    ["Floor plan", /\/app\/floor-plan$/],
    ["Menu", /\/app\/menu$/],
    ["Rooms", /\/app\/rooms$/],
    ["Orders", /\/app\/orders$/],
    ["Customers", /\/app\/customers$/],
    ["Stock", /\/app\/inventory$/],
    ["Reports", /\/app\/reports$/],
    ["Audit log", /\/app\/audit$/],
    ["Settings", /\/app\/settings$/],
  ];
  for (const [link, url] of stops) {
    await owner
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: link, exact: true })
      .click();
    await expect(owner, link).toHaveURL(url);
    await expect(owner.getByRole("heading", { level: 1 }).first(), link).toBeVisible();
    // No page may fall over: the error boundary / failure states have their own wording.
    await expect(owner.getByText("Something went wrong"), link).toHaveCount(0);
  }
});
