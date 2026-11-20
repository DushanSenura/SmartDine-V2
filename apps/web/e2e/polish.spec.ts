import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { API, apiToken, auth, resetFloor, signIn, type Table } from "./helpers";

async function violations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations.map(
    (v) => `${label}: ${v.id} - ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(" | ")})`,
  );
}

/** Lets lazy content and entrance animations settle before contrast is measured. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test("public pages have no detectable WCAG A/AA violations", async ({ page }) => {
      const found: string[] = [];
      for (const path of ["/", "/menu", "/reservations", "/rooms", "/login"]) {
        await page.goto(path);
        await expect(page.locator("main, #content").first()).toBeVisible();
        await settle(page);
        found.push(...(await violations(page, path)));
      }
      expect(found).toEqual([]);
    });

    test("staff screens have no detectable WCAG A/AA violations", async ({ page }) => {
      const screens: [string, string][] = [
        ["owner@smartdine.test", "/app/owner"],
        ["waiter@smartdine.test", "/app/waiter"],
        ["kitchen@smartdine.test", "/app/kitchen"],
        ["cashier@smartdine.test", "/app/cashier"],
      ];
      const found: string[] = [];
      for (const [email, path] of screens) {
        await signIn(page, email);
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await settle(page);
        found.push(...(await violations(page, `${email} ${path}`)));
        await page.getByRole("button", { name: "Sign out" }).click();
        await expect(page).toHaveURL(/\/login/);
      }
      expect(found).toEqual([]);
    });
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("staff navigate with a drawer and nothing scrolls sideways", async ({ page }) => {
    await signIn(page, "manager@smartdine.test");
    await expect(page.getByRole("heading", { level: 1, name: "Manager dashboard" })).toBeVisible();

    // The fixed sidebar is gone; the page fits the screen.
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    await drawer.getByRole("link", { name: "Menu", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/menu$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();
  });

  test("the public pages fit a phone", async ({ page }) => {
    for (const path of ["/", "/menu", "/reservations", "/rooms"]) {
      await page.goto(path);
      await settle(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test("the skip link jumps past the navigation", async ({ page }) => {
  await signIn(page, "manager@smartdine.test");
  await expect(page.getByRole("heading", { level: 1, name: "Manager dashboard" })).toBeVisible();
  // Start from the top of the document, as a keyboard user arriving on the page would.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#content")).toBeFocused();
});

test("a new notification pops up as a toast and links to its page", async ({ page, request }) => {
  await signIn(page, "manager@smartdine.test");
  await expect(page.getByRole("heading", { level: 1, name: "Manager dashboard" })).toBeVisible();

  const [waiter, manager] = await Promise.all([
    apiToken(request, "waiter@smartdine.test"),
    apiToken(request, "manager@smartdine.test"),
  ]);
  const tables = (await (await request.get(`${API}/tables`, { headers: auth(manager) })).json())
    .data as Table[];
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
  const order = (await created.json()).data as { id: string };
  await request.post(`${API}/orders/${order.id}/submit`, { headers: auth(waiter) });

  const toasts = page.getByRole("region", { name: "Toast messages" });
  const link = toasts.getByRole("button", { name: /waiting for approval/ });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/app/orders/${order.id}$`));
  await expect(toasts.getByRole("button", { name: /waiting for approval/ })).toHaveCount(0);
});

test("going offline says so, and coming back clears it", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  const toasts = page.getByRole("region", { name: "Toast messages" });
  await expect(toasts.getByText("You're offline")).toBeVisible();
  await context.setOffline(false);
  await expect(toasts.getByText("You're offline")).toHaveCount(0);
  await expect(toasts.getByText("Back online")).toBeVisible();
});

test.afterAll(async ({ request }) => {
  await resetFloor(request);
});
