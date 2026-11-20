import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { apiToken, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const api = (token: string) => ({ Authorization: `Bearer ${token}` });

test.afterAll(async ({ request }) => {
  // Void whatever is still open so the demo floor is left as we found it.
  const headers = api(await apiToken(request, "manager@smartdine.test"));
  const orders = (await (await request.get("/api/v2/orders?scope=active", { headers })).json())
    .data as { id: string }[] | undefined;
  for (const o of orders ?? []) {
    await request.post(`/api/v2/orders/${o.id}/cancel`, {
      headers,
      data: { reason: "e2e cleanup" },
    });
  }
});

// Contexts opened by a test are closed after it: abandoned live screens keep refetching on every
// socket event and would crowd the next spec's requests.
const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function staffPage(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  opened.push(context);
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

test("waiter order → kitchen → ready → served, live without reloading", async ({ browser }) => {
  const waiter = await staffPage(browser, "waiter@smartdine.test");
  const kitchen = await staffPage(browser, "kitchen@smartdine.test");

  await kitchen.goto("/app/kitchen");
  await expect(kitchen.getByRole("heading", { level: 1, name: "Kitchen" })).toBeVisible();

  // The waiter builds a dine-in order for the first free table.
  await waiter.goto("/app/orders/new");
  await expect(waiter.getByRole("heading", { level: 1, name: "New order" })).toBeVisible();
  const tableSelect = waiter.getByLabel("Table", { exact: true });
  await tableSelect.selectOption({ index: 1 });
  const tableLabel = await tableSelect.evaluate(
    (el: HTMLSelectElement) => el.selectedOptions[0]?.textContent ?? "",
  );
  const tableName = /Table \S+/.exec(tableLabel)![0];

  await waiter.getByRole("button", { name: "Add Crispy Calamari" }).click();
  await waiter.getByRole("button", { name: "Add Fresh Lime Soda" }).click();
  await waiter.getByLabel("Kitchen instructions").fill("Allergy: no sesame");
  await expect(waiter.getByRole("heading", { name: "Dishes (2)" })).toBeVisible();
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(waiter.getByRole("heading", { level: 1, name: /^Order / })).toBeVisible();

  // Kitchen sees the ticket live — no reload — and it carries no prices.
  const ticket = kitchen.getByRole("article", { name: new RegExp(`${tableName}$`) });
  await expect(ticket).toBeVisible();
  await expect(ticket.getByText("Allergy: no sesame")).toBeVisible();
  await expect(ticket.getByText(/\d[\d,]*\.\d{2}/)).toHaveCount(0);

  // Per-dish progress: start one, finish both.
  await ticket.getByRole("button", { name: "Start Crispy Calamari" }).click();
  await ticket.getByRole("button", { name: "Ready Crispy Calamari" }).click();
  await ticket.getByRole("button", { name: "Ready Fresh Lime Soda" }).click();

  // The waiter is told on the order page itself, still without a reload.
  await expect(waiter.getByRole("button", { name: /Serve 2 ready dishes/ })).toBeVisible();
  await waiter.getByRole("button", { name: /Serve 2 ready dishes/ }).click();
  await expect(waiter.getByRole("button", { name: "Request bill" })).toBeVisible();
  await waiter.getByRole("button", { name: "Request bill" }).click();
  await expect(waiter.getByText("Bill requested").first()).toBeVisible();

  // The floor plan reflects it.
  await waiter.goto("/app/floor-plan");
  await expect(waiter.getByRole("heading", { level: 1, name: /Floor/ })).toBeVisible();
});

test("a new ticket appears live and the station filter can be toggled", async ({ browser }) => {
  const waiter = await staffPage(browser, "waiter@smartdine.test");
  const kitchen = await staffPage(browser, "kitchen@smartdine.test");
  await kitchen.goto("/app/kitchen");
  await expect(kitchen.getByRole("heading", { level: 1, name: "Kitchen" })).toBeVisible();

  await waiter.goto("/app/orders/new");
  await waiter.getByLabel("Table", { exact: true }).selectOption({ index: 2 });
  await waiter.getByRole("button", { name: "Add Warm Chocolate Fondant" }).click();
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(waiter.getByRole("heading", { level: 1, name: /^Order / })).toBeVisible();

  await expect(kitchen.getByRole("article")).not.toHaveCount(0);
  await kitchen.getByRole("button", { name: "Grill", exact: true }).click();
  await expect(kitchen.getByRole("button", { name: "Grill", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await kitchen.getByRole("button", { name: "All stations" }).click();
});

test("kitchen cannot open Orders and a cashier cannot create orders", async ({ browser }) => {
  const kitchen = await staffPage(browser, "kitchen@smartdine.test");
  await kitchen.goto("/app/orders");
  await expect(kitchen).toHaveURL(/forbidden/);

  const cashier = await staffPage(browser, "cashier@smartdine.test");
  await cashier.goto("/app/orders/new");
  await expect(cashier).toHaveURL(/forbidden/);
});
