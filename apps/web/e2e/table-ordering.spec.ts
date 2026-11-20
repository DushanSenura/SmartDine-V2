import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { resetFloor, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const opened: BrowserContext[] = [];
test.afterEach(async ({ request }) => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
  await resetFloor(request);
});

async function pageFor(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  opened.push(context);
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

test("a customer orders from their table; the kitchen, their waiter and the order list all see it", async ({
  browser,
}) => {
  // ── The customer ───────────────────────────────────────────────
  const customer = await pageFor(browser, "customer@smartdine.test");
  await customer.goto("/menu");
  await expect(customer.getByRole("heading", { level: 1 })).toContainText("Made to be shared");

  await customer.getByLabel("Table number").fill("999");
  await customer.getByLabel("Table number").blur();
  await expect(customer.getByRole("alert").filter({ hasText: "find table 999" })).toBeVisible();

  await customer.getByLabel("Table number").fill("4");
  await customer.getByLabel("Table number").blur();
  await expect(customer.getByText(/Table 4.* found/)).toBeVisible();

  // Ask for a specific waiter: the first named one in the list.
  const waiter = customer.getByLabel(/Your waiter/);
  await waiter.selectOption({ index: 1 });
  const waiterName = (await waiter.locator("option:checked").textContent())!.trim();

  await customer
    .getByRole("button", { name: /to order$/ })
    .first()
    .click();
  await customer.getByRole("button", { name: /^Send to kitchen/ }).click();
  await expect(
    customer.getByRole("status").filter({ hasText: "is with the kitchen" }),
  ).toBeVisible();
  await expect(customer.getByRole("status")).toContainText(waiterName);

  // ── The kitchen ────────────────────────────────────────────────
  const kitchen = await pageFor(browser, "kitchen@smartdine.test");
  await kitchen.goto("/app/kitchen");
  await expect(kitchen.getByRole("heading", { name: "Table 4" })).toBeVisible();

  // ── The waiter they asked for ──────────────────────────────────
  const staff = await pageFor(browser, "waiter@smartdine.test");
  await staff.goto("/app/orders");
  await expect(staff.getByText("Guest order").first()).toBeVisible();
});

test("a signed-out visitor can browse the menu but is asked to sign in before ordering", async ({
  page,
}) => {
  await page.goto("/menu");
  await expect(page.getByText("Sign in to order from your table")).toBeVisible();
  await expect(page.getByLabel("Table number")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /to order$/ })).toHaveCount(0);

  // The old address still works.
  await page.goto("/order");
  await expect(page).toHaveURL(/\/menu$/);
});
