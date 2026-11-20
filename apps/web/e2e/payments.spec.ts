import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { API, apiToken, auth, billRequestedOrder, resetFloor, signIn, type Table } from "./helpers";

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

test.afterAll(async ({ request }) => {
  await resetFloor(request);
});

test("a served order is paid in two parts and completes with a receipt, live for the waiter", async ({
  browser,
  request,
}) => {
  const order = await billRequestedOrder(request, 0);

  // The waiter is watching the order; it should finish by itself when the cashier is done.
  const waiter = await staffPage(browser, "waiter@smartdine.test");
  await waiter.goto(`/app/orders/${order.id}`);
  await expect(waiter.getByRole("heading", { level: 1, name: /^Order / })).toBeVisible();
  await expect(waiter.getByText("Bill requested").first()).toBeVisible();

  const cashier = await staffPage(browser, "cashier@smartdine.test");
  await expect(cashier).toHaveURL(/\/app\/cashier$/);
  await expect(cashier.getByRole("heading", { level: 1, name: "Cashier" })).toBeVisible();
  await cashier
    .getByRole("button", { name: `Open bill for Table ${order.table.tableNumber}` })
    .click();
  await expect(cashier.getByRole("heading", { level: 1, name: /^Bill B-/ })).toBeVisible();
  await expect(cashier.getByText("Open", { exact: true }).first()).toBeVisible();

  // Cashiers have a discount ceiling; a manager would be needed above it.
  const discountForm = cashier.getByRole("form", { name: "Discount" });
  await discountForm.getByLabel("Discount value").fill("25");
  await discountForm.getByLabel("Discount reason").fill("Complaint about the wait");
  await discountForm.getByRole("button", { name: "Apply discount" }).click();
  await expect(discountForm.getByRole("alert")).toContainText("need a manager");
  await discountForm.getByLabel("Discount value").fill("5");
  await discountForm.getByRole("button", { name: "Apply discount" }).click();
  await expect(discountForm.getByRole("button", { name: "Update discount" })).toBeVisible();

  // Split in two: guest 1 pays cash and is given change.
  await cashier.getByRole("button", { name: "Split bill" }).click();
  await expect(cashier.getByRole("heading", { name: "Split the bill" })).toBeVisible();
  await cashier.getByRole("button", { name: "Use share for guest 1" }).click();
  const payment = cashier.getByRole("form", { name: "Take payment" });
  const share = Number(await payment.getByLabel("Amount to pay").inputValue());
  expect(share).toBeGreaterThan(0);
  await payment.getByLabel("Cash received").fill(String(Math.ceil(share) + 1000));
  await expect(payment.getByText(/1,\d{3}/).first()).toBeVisible(); // change due is shown
  await payment.getByRole("button", { name: /^Take / }).click();
  await expect(cashier.getByRole("region", { name: "Payments" })).toContainText("Cash");
  await expect(cashier.getByText("Open", { exact: true }).first()).toBeVisible();

  // Guest 2 pays the rest by card with an approval code.
  const rest = cashier.getByRole("form", { name: "Take payment" });
  await rest.getByLabel("Payment method").selectOption("CREDIT_CARD");
  await rest.getByLabel("Reference (optional)").fill("AUTH-4821");
  await rest.getByRole("button", { name: /^Take / }).click();
  await expect(cashier.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(cashier.getByLabel("Balance due")).toHaveText(/^LKR\s0$/);
  await expect(cashier.getByRole("form", { name: "Take payment" })).toHaveCount(0);

  // The waiter's order page completed without a reload.
  await expect(waiter.getByText("Completed", { exact: true }).first()).toBeVisible();

  // Receipt: on screen and as a real PDF.
  await cashier.getByRole("link", { name: "View receipt" }).click();
  const receipt = cashier.getByRole("article", { name: /^Receipt R-/ });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("Cash");
  await expect(receipt).toContainText("Credit card");
  await expect(receipt).toContainText("AUTH-4821");
  await expect(receipt).toContainText("Service charge");
  const [download] = await Promise.all([
    cashier.waitForEvent("download"),
    cashier.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^R-\d{8}-\d{3}\.pdf$/);
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");

  // The guests' table is waiting to be cleaned, then goes back into service.
  const manager = auth(await apiToken(request, "manager@smartdine.test"));
  const tables = (await (await request.get(`${API}/tables`, { headers: manager })).json())
    .data as Table[];
  expect(tables.find((t) => t.id === order.table.id)?.status).toBe("CLEANING");
});

test("a cashier can refund part of a card payment, with a reason", async ({ browser, request }) => {
  const order = await billRequestedOrder(request, 1);
  const cashier = await staffPage(browser, "cashier@smartdine.test");
  await cashier
    .getByRole("button", { name: `Open bill for Table ${order.table.tableNumber}` })
    .click();
  await expect(cashier.getByRole("heading", { level: 1, name: /^Bill B-/ })).toBeVisible();

  const form = cashier.getByRole("form", { name: "Take payment" });
  await form.getByLabel("Payment method").selectOption("DEBIT_CARD");
  await form.getByRole("button", { name: /^Take / }).click();
  await expect(cashier.getByText("Paid", { exact: true }).first()).toBeVisible();

  await cashier.getByRole("button", { name: /Refund debit card payment/ }).click();
  const dialog = cashier.getByRole("dialog");
  await dialog.getByLabel("Refund amount").fill("100");
  // A reason is mandatory, so the button stays disabled until one is given.
  await expect(dialog.getByRole("button", { name: "Refund", exact: true })).toBeDisabled();
  await dialog.getByLabel("Refund reason").fill("Dish arrived cold");
  await dialog.getByRole("button", { name: "Refund", exact: true }).click();
  await expect(cashier.getByText(/Dish arrived cold/)).toBeVisible();

  // History lists it for the day.
  await cashier.goto("/app/payments");
  await expect(cashier.getByRole("heading", { level: 1, name: "Payment history" })).toBeVisible();
  await expect(cashier.getByRole("table")).toContainText("Debit card");
});

test("only the cashier's till is open to cashiers; waiters and kitchen are kept out", async ({
  browser,
}) => {
  for (const email of ["waiter@smartdine.test", "kitchen@smartdine.test"]) {
    const page = await staffPage(browser, email);
    await page.goto("/app/cashier");
    await expect(page).toHaveURL(/forbidden/);
    await page.goto("/app/payments");
    await expect(page).toHaveURL(/forbidden/);
  }
});
