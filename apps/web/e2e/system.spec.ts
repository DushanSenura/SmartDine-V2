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
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  opened.push(context);
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

test.afterAll(async ({ request }) => {
  await resetFloor(request);
  // Put the payment settings back whatever happened.
  const owner = auth(await apiToken(request, "owner@smartdine.test"));
  await request.put(`${API}/settings`, {
    headers: owner,
    data: {
      settings: {
        cashierDiscountLimitPercent: 10,
        enabledPaymentMethods: [
          "CASH",
          "CREDIT_CARD",
          "DEBIT_CARD",
          "MOBILE_PAYMENT",
          "BANK_TRANSFER",
          "ROOM_CHARGE",
        ],
      },
    },
  });
});

test("an owner reads the dashboard, switches a chart to a table and exports a report", async ({
  browser,
}) => {
  const owner = await staffPage(browser, "owner@smartdine.test");
  await expect(owner).toHaveURL(/\/app\/owner$/);
  await expect(owner.getByRole("heading", { level: 1, name: "Owner dashboard" })).toBeVisible();

  // Today at a glance.
  const today = owner.getByRole("group", { name: "Today" }).or(owner.getByLabel("Today"));
  await expect(today.getByText("Revenue today")).toBeVisible();
  await expect(today.getByText("Orders today")).toBeVisible();
  await expect(today.getByText("Room occupancy")).toBeVisible();
  await expect(today.getByText("Low stock items")).toBeVisible();

  // Every chart has a table twin of the same numbers.
  const trend = owner.getByRole("region", { name: "Revenue trend" });
  await expect(trend.getByRole("img", { name: /Revenue per day/ })).toBeVisible();
  await trend.getByRole("button", { name: "View as table" }).click();
  await expect(trend.getByRole("table")).toBeVisible();
  await expect(trend.getByRole("columnheader", { name: "Day" })).toBeVisible();
  await trend.getByRole("button", { name: "Show chart" }).click();
  await expect(trend.getByRole("img", { name: /Revenue per day/ })).toBeVisible();

  // Owners compare branches.
  await expect(owner.getByRole("region", { name: "Branch comparison" })).toBeVisible();
  await owner.getByLabel("Period").selectOption("30");
  await expect(owner.getByRole("img", { name: "Revenue per day, last 30 days" })).toBeVisible();

  // A report, on screen and as downloads.
  await owner.getByRole("link", { name: "Reports" }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(owner.getByRole("table")).toBeVisible();
  await owner.getByLabel("Report", { exact: true }).selectOption("payments");
  await expect(owner.getByRole("heading", { level: 2, name: "Payments" })).toBeVisible();

  await owner.getByLabel("Report", { exact: true }).selectOption("sales");
  await expect(owner.getByRole("heading", { level: 2, name: /^Sales/ })).toBeVisible();
  const [csv] = await Promise.all([
    owner.waitForEvent("download"),
    owner.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/^sales-.*\.csv$/);
  const text = (await readFile(await csv.path())).toString("utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text.split("\r\n")[0]).toContain("Net revenue");

  const [pdf] = await Promise.all([
    owner.waitForEvent("download"),
    owner.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect((await readFile(await pdf.path())).subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
});

test("a manager sees the dashboard for their branch, but no audit log or branch comparison", async ({
  browser,
}) => {
  const manager = await staffPage(browser, "manager@smartdine.test");
  await expect(manager.getByRole("heading", { level: 1, name: "Manager dashboard" })).toBeVisible();
  await expect(manager.getByLabel("Today").getByText("Revenue today")).toBeVisible();
  await expect(manager.getByRole("region", { name: "Branch comparison" })).toHaveCount(0);
  await expect(manager.getByRole("link", { name: "Audit log" })).toHaveCount(0);
  await expect(manager.getByLabel("Branch", { exact: true })).toHaveCount(0);

  await manager.goto("/app/audit");
  await expect(manager).toHaveURL(/forbidden/);

  // Branch comparison isn't offered to managers as a report either.
  await manager.goto("/app/reports");
  await expect(
    manager
      .getByLabel("Report", { exact: true })
      .locator("option", { hasText: "Branch performance" }),
  ).toHaveCount(0);

  for (const email of [
    "waiter@smartdine.test",
    "cashier@smartdine.test",
    "kitchen@smartdine.test",
  ]) {
    const page = await staffPage(browser, email);
    await page.goto("/app/reports");
    await expect(page, email).toHaveURL(/forbidden/);
  }
});

test("the bell shows a new notification live, opens its page, and marks things read", async ({
  browser,
  request,
}) => {
  const manager = await staffPage(browser, "manager@smartdine.test");
  await expect(manager.getByRole("heading", { level: 1, name: "Manager dashboard" })).toBeVisible();
  const bell = manager.getByRole("button", { name: /^Notifications/ });
  await bell.click();
  const markAll = manager.getByRole("button", { name: "Mark all read" });
  // Start from a clean slate (the button is disabled when there is nothing unread).
  if (await markAll.isEnabled()) await markAll.click();
  await manager.keyboard.press("Escape");
  await expect(bell).toHaveAccessibleName("Notifications");

  // A waiter submits an order for approval from elsewhere; the manager's bell updates with no reload.
  const [waiter, tables] = await Promise.all([
    apiToken(request, "waiter@smartdine.test"),
    apiToken(request, "manager@smartdine.test").then(
      async (t) =>
        (await (await request.get(`${API}/tables`, { headers: auth(t) })).json()).data as Table[],
    ),
  ]);
  const table = tables.find((t) => t.status === "AVAILABLE") ?? tables[0]!;
  const menu = (await (await request.get(`${API}/menu?branchId=${table.branchId}`)).json()).data
    .items as { id: string; isAvailableNow: boolean; modifiers: unknown[] }[];
  const dish = menu.find((m) => m.isAvailableNow && m.modifiers.length === 0)!;
  const created = await request.post(`${API}/orders`, {
    headers: auth(waiter),
    data: {
      type: "DINE_IN",
      tableId: table.id,
      items: [{ menuItemId: dish.id, quantity: 1, modifierIds: [] }],
    },
  });
  const order = (await created.json()).data as { id: string; orderNumber: string };
  await request.post(`${API}/orders/${order.id}/submit`, { headers: auth(waiter) });

  await expect(bell).toHaveAccessibleName(/1 unread/);
  await bell.click();
  const panel = manager.getByRole("region", { name: "Notifications" });
  await expect(panel.getByRole("heading", { name: "Orders" })).toBeVisible();
  // Earlier runs leave read notifications in the list, so pick this order's by its number.
  const item = panel.getByRole("button", {
    name: new RegExp(`waiting for approval.*${order.orderNumber}`),
  });
  await expect(item).toBeVisible();

  // Opening it goes to the order and marks it read.
  await item.click();
  await expect(manager).toHaveURL(new RegExp(`/app/orders/${order.id}$`));
  await expect(manager.getByRole("heading", { level: 1, name: /^Order / })).toBeVisible();
  await expect(bell).toHaveAccessibleName("Notifications");
  await bell.click();
  await expect(
    panel.getByRole("button", { name: new RegExp(order.orderNumber) }),
  ).not.toContainText("(unread)");
  await manager.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("Ctrl+K searches everything the role may open, with the keyboard", async ({ browser }) => {
  const manager = await staffPage(browser, "manager@smartdine.test");
  // The shortcut is registered once the staff layout has mounted.
  await expect(manager.getByRole("heading", { level: 1, name: "Manager dashboard" })).toBeVisible();
  await manager.keyboard.press("Control+k");
  const dialog = manager.getByRole("dialog");
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await expect(dialog.getByText("Type at least 2 characters.")).toBeVisible();

  await dialog.getByRole("combobox").fill("Calamari");
  await expect(dialog.getByRole("group", { name: "Menu items" })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /Crispy Calamari/ })).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText(/result/);
  await dialog.getByRole("combobox").press("Enter");
  await expect(manager).toHaveURL(/\/app\/menu$/);
  // Let the first palette finish closing before reopening it (focus is still being handed back).
  await expect(manager.getByRole("dialog")).toHaveCount(0);
  await expect(manager.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();

  // Nothing found is said plainly; the header button opens it too.
  await manager.getByRole("button", { name: "Search" }).click();
  await manager.getByRole("combobox").fill("zzqqxx");
  await expect(manager.getByRole("status")).toContainText("No results");
  await manager.keyboard.press("Escape");
  await expect(manager.getByRole("dialog")).toHaveCount(0);

  // The kitchen can find dishes but nothing else.
  const kitchen = await staffPage(browser, "kitchen@smartdine.test");
  await expect(kitchen.getByRole("heading", { level: 1, name: "Kitchen" })).toBeVisible();
  await kitchen.keyboard.press("Control+k");
  await kitchen.getByRole("combobox").fill("Calamari");
  await expect(kitchen.getByRole("option", { name: /Crispy Calamari/ })).toBeVisible();
  await kitchen.getByRole("combobox").fill("Wendy");
  await expect(kitchen.getByRole("status")).toContainText("No results");
});

test("the owner's payment settings change what the cashier can take, and are audited", async ({
  browser,
  request,
}) => {
  const order = await billRequestedOrder(request, 0);

  const owner = await staffPage(browser, "owner@smartdine.test");
  await owner.getByRole("link", { name: "Settings" }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await owner.getByLabel("Mobile payment").uncheck();
  await owner.getByRole("button", { name: "Save settings" }).click();
  await expect(owner.getByText("Settings saved")).toBeVisible();

  const cashier = await staffPage(browser, "cashier@smartdine.test");
  await cashier
    .getByRole("button", { name: `Open bill for Table ${order.table.tableNumber}` })
    .click();
  await expect(cashier.getByRole("heading", { level: 1, name: /^Bill B-/ })).toBeVisible();
  const method = cashier.getByLabel("Payment method");
  await expect(method.locator("option", { hasText: "Cash" })).toHaveCount(1);
  await expect(method.locator("option", { hasText: "Mobile payment" })).toHaveCount(0);

  // The change is on the record, with who made it.
  await owner.getByRole("link", { name: "Audit log" }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
  await owner.getByLabel("Action contains").fill("settings");
  const row = owner.getByRole("row").filter({ hasText: "settings.updated" }).first();
  await expect(row).toContainText("Olivia Owner");
  await expect(row).toContainText("enabledPaymentMethods");

  // Put it back.
  await owner.getByRole("link", { name: "Settings" }).click();
  await owner.getByLabel("Mobile payment").check();
  await owner.getByRole("button", { name: "Save settings" }).click();
  await expect(owner.getByText("Settings saved")).toBeVisible();
});
