import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { API, apiToken, auth, billRequestedOrder, resetFloor, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

// Contexts opened by a test are closed after it: abandoned live screens keep refetching on every
// socket event and would crowd the next spec's requests.
const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

async function staffPage(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ acceptDownloads: true });
  opened.push(context);
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

const run = Date.now().toString(36);

test.afterAll(async ({ request }) => {
  await resetFloor(request);
  const headers = auth(await apiToken(request, "manager@smartdine.test"));
  const get = async (path: string) =>
    ((await (await request.get(`${API}${path}`, { headers })).json()).data ?? []) as {
      id: string;
      name: string;
    }[];
  for (const [path, base] of [
    ["/inventory/items", "/inventory/items"],
    ["/suppliers", "/suppliers"],
    ["/promotions", "/promotions"],
  ] as const) {
    for (const row of (await get(path)).filter((r) => r.name.startsWith("E2E "))) {
      await request.delete(`${API}${base}/${row.id}`, { headers });
    }
  }
});

test("a manager tracks stock: new item, usage, a count that flags low stock, and the history", async ({
  browser,
}) => {
  const manager = await staffPage(browser, "manager@smartdine.test");
  const name = `E2E Flour ${run}`;

  await manager.getByRole("link", { name: "Suppliers" }).click();
  await expect(manager.getByRole("heading", { level: 1, name: "Suppliers" })).toBeVisible();
  await manager.getByRole("button", { name: "New supplier" }).first().click();
  const supplierDialog = manager.getByRole("dialog");
  await supplierDialog.getByLabel("Supplier name").fill(`E2E Mill ${run}`);
  await supplierDialog.getByLabel("Products").fill("flour, sugar");
  await supplierDialog.getByRole("button", { name: "Save supplier" }).click();
  await expect(manager.getByText(`E2E Mill ${run}`)).toBeVisible();

  await manager.getByRole("link", { name: "Stock", exact: true }).click();
  await expect(manager.getByRole("heading", { level: 1, name: "Stock" })).toBeVisible();
  await manager.getByRole("button", { name: "New item" }).click();
  const dialog = manager.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("SKU").fill(`E2E-${run}`);
  await dialog.getByLabel("Category").fill("Dry goods");
  await dialog.getByLabel("Unit", { exact: true }).fill("kg");
  await dialog.getByLabel("Opening quantity").fill("20");
  await dialog.getByLabel("Reorder level").fill("5");
  await dialog.getByLabel("Cost per unit").fill("120");
  await dialog.getByLabel("Supplier").selectOption({ label: `E2E Mill ${run}` });
  await dialog.getByRole("button", { name: "Save item" }).click();
  const row = manager.getByRole("row", { name });
  await expect(row).toContainText("20 kg");
  await expect(row).toContainText("In stock");

  // Use some: the balance follows.
  await manager.getByRole("button", { name: `Record movement for ${name}` }).click();
  const move = manager.getByRole("dialog");
  await move.getByLabel("Movement").selectOption("USE");
  await move.getByLabel("Quantity (kg)").fill("8");
  await move.getByLabel("Note").fill("Weekend baking");
  await move.getByRole("button", { name: "Record" }).click();
  await expect(row).toContainText("12 kg");

  // Using more than is there is refused, with the balance in the message.
  await manager.getByRole("button", { name: `Record movement for ${name}` }).click();
  const tooMuch = manager.getByRole("dialog");
  await tooMuch.getByLabel("Movement").selectOption("USE");
  await tooMuch.getByLabel("Quantity (kg)").fill("99");
  await tooMuch.getByRole("button", { name: "Record" }).click();
  await expect(tooMuch.getByRole("alert")).toContainText("Only 12 kg on hand");

  // A stock count below the reorder level flags it.
  await tooMuch.getByLabel("Movement").selectOption("ADJUSTMENT");
  await tooMuch.getByLabel("Counted quantity (kg)").fill("4");
  await tooMuch.getByRole("button", { name: "Record" }).click();
  await expect(row).toContainText("4 kg");
  await expect(row).toContainText("Low stock");

  // The filter finds it, and the history shows all three movements.
  await manager.getByLabel("Status").selectOption("LOW_STOCK");
  await expect(manager.getByRole("row", { name })).toBeVisible();
  await manager.getByRole("link", { name: "Stock history" }).click();
  await expect(manager.getByRole("heading", { level: 1, name: "Stock history" })).toBeVisible();
  const history = manager.getByRole("table");
  await expect(history).toContainText(name);
  await expect(history).toContainText("Opening stock");
  await expect(history).toContainText("Weekend baking");
  await expect(history).toContainText("Stock count");
});

test("a manager creates and archives a promotion; floor staff can't reach the new areas", async ({
  browser,
}) => {
  const manager = await staffPage(browser, "manager@smartdine.test");
  const code = `E2E${run}`.toUpperCase();
  await manager.getByRole("link", { name: "Promotions" }).click();
  await expect(manager.getByRole("heading", { level: 1, name: "Promotions" })).toBeVisible();
  await manager.getByRole("button", { name: "New promotion" }).first().click();
  const dialog = manager.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(`E2E Lunch ${run}`);
  await dialog.getByLabel("Promo code").fill(code);
  await dialog.getByLabel("Percent off (%)").fill("12");
  await dialog.getByRole("button", { name: "Save promotion" }).click();
  const card = manager.getByRole("listitem").filter({ hasText: `E2E Lunch ${run}` });
  await expect(card).toContainText("12% off");
  await expect(card).toContainText(code);
  await expect(card).toContainText("Live");

  await card.getByRole("button", { name: `Archive E2E Lunch ${run}` }).click();
  await manager.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
  await expect(manager.getByText(`E2E Lunch ${run}`)).toHaveCount(0);

  for (const email of ["waiter@smartdine.test", "kitchen@smartdine.test"]) {
    const page = await staffPage(browser, email);
    for (const path of [
      "/app/inventory",
      "/app/suppliers",
      "/app/promotions",
      "/app/customers",
      "/app/reviews",
    ]) {
      await page.goto(path);
      await expect(page, `${email} ${path}`).toHaveURL(/forbidden/);
    }
  }
  const cashier = await staffPage(browser, "cashier@smartdine.test");
  await cashier.goto("/app/customers");
  await expect(cashier).toHaveURL(/forbidden/);
});

test("loyalty end to end: attach, promo code, redeem, then the customer's points, invoice, favourites and review", async ({
  browser,
  request,
}) => {
  const order = await billRequestedOrder(request, 2);

  // ── The cashier ────────────────────────────────────────────────
  const cashier = await staffPage(browser, "cashier@smartdine.test");
  await cashier
    .getByRole("button", { name: `Open bill for Table ${order.table.tableNumber}` })
    .click();
  await expect(cashier.getByRole("heading", { level: 1, name: /^Bill B-/ })).toBeVisible();
  const panel = cashier.getByRole("region", { name: "Customer and offers" });

  await panel.getByLabel("Find a customer").fill("customer@smart");
  await panel.getByRole("button", { name: /Chris Customer/ }).click();
  await expect(panel.getByText("Chris Customer")).toBeVisible();
  const pointsText = await panel.getByLabel("Customer points").textContent();
  const startingPoints = Number(/(\d+) points/.exec(pointsText ?? "")![1]);
  expect(startingPoints).toBeGreaterThanOrEqual(60);

  // A wrong code is explained; the right one discounts the bill.
  await panel.getByLabel("Promo code", { exact: true }).fill("NOPE");
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(panel.getByText("That code isn't valid.")).toBeVisible();
  await panel.getByLabel("Promo code", { exact: true }).fill("WELCOME10");
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(panel.getByText("Welcome 10%")).toBeVisible();
  await expect(cashier.getByText("Discount", { exact: true }).first()).toBeVisible();

  // Spend 50 points, then pay the rest in cash.
  await panel.getByLabel("Points to use").fill("50");
  await panel.getByRole("button", { name: /^Use / }).click();
  await expect(cashier.getByRole("region", { name: "Payments" })).toContainText("Loyalty points");
  const form = cashier.getByRole("form", { name: "Take payment" });
  await form.getByRole("button", { name: /^Take / }).click();
  await expect(cashier.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(cashier.getByText(/earned \d+ points/)).toBeVisible();
  const earned = Number(
    /earned (\d+) points/.exec(
      (await cashier.getByText(/earned \d+ points/).textContent()) ?? "",
    )![1],
  );
  expect(earned).toBeGreaterThan(0);

  // ── The customer ───────────────────────────────────────────────
  const customer = await staffPage(browser, "customer@smartdine.test");
  await customer.goto("/account/loyalty");
  await expect(customer.getByLabel("Points balance")).toContainText(
    String(startingPoints - 50 + earned),
  );
  const ledger = customer.getByRole("main").getByRole("list").last();
  await expect(ledger).toContainText("Redeemed");
  await expect(ledger).toContainText("Earned");

  await customer.getByRole("link", { name: "Invoices" }).click();
  await customer.getByRole("link", { name: "View receipt" }).first().click();
  const receipt = customer.getByRole("article", { name: /^Receipt R-/ });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("Loyalty points");
  const [download] = await Promise.all([
    customer.waitForEvent("download"),
    customer.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe("%PDF-");

  // Favourites: heart a dish on the public menu; it shows up in the account.
  await customer.goto("/menu");
  const heart = customer.getByRole("button", { name: /^Save .* to favourites$/ }).first();
  const saveLabel = (await heart.getAttribute("aria-label"))!;
  const dish = /^Save (.*) to favourites$/.exec(saveLabel)![1]!;
  await heart.click();
  await expect(
    customer.getByRole("button", { name: `Remove ${dish} from favourites` }),
  ).toBeVisible();
  await customer.goto("/account/favourites");
  await expect(customer.getByRole("list").getByText(dish)).toBeVisible();
  await customer.getByRole("button", { name: `Remove ${dish} from favourites` }).click();
  await expect(customer.getByText("No favourites here yet")).toBeVisible();

  // Review the visit.
  const comment = `E2E lovely dinner ${run}`;
  await customer.goto("/account/reviews");
  await customer
    .getByRole("button", { name: /^Write a review for Dining/ })
    .first()
    .click();
  const review = customer.getByRole("form", { name: /^Review Dining/ });
  await review.getByLabel("5 stars").check({ force: true });
  await review.getByLabel("Comment (optional)").fill(comment);
  await review.getByRole("button", { name: "Submit review" }).click();
  await expect(customer.getByText(`“${comment}”`)).toBeVisible();

  // It's public…
  const visitor = await staffPage(browser, "customer@smartdine.test");
  await visitor.goto("/about");
  await expect(visitor.getByRole("region", { name: "Guest reviews" })).toContainText(comment);

  // …until a manager hides it.
  const manager = await staffPage(browser, "manager@smartdine.test");
  await manager.getByRole("link", { name: "Reviews" }).click();
  await expect(manager.getByRole("heading", { level: 1, name: "Reviews" })).toBeVisible();
  const card = manager.getByRole("listitem").filter({ hasText: comment });
  await card.getByRole("button", { name: "Hide" }).click();
  await expect(card).toContainText("Hidden");
  await visitor.reload();
  await expect(visitor.getByRole("region", { name: "Guest reviews" })).not.toContainText(comment);
});
