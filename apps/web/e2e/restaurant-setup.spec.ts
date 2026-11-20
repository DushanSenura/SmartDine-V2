import { expect, test } from "@playwright/test";

import { DEMO_PASSWORD, apiToken, signIn } from "./helpers";

const stamp = Date.now().toString(36);
const branchName = `E2E Branch ${stamp}`;
const branchCode = `E2E-${stamp}`.toUpperCase().slice(0, 16);
const waiterEmail = `e2e-waiter-${stamp}@smartdine.test`;

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  // Best-effort cleanup through the API so repeated runs do not pile up data.
  const token = await apiToken(request, "owner@smartdine.test");
  const headers = { Authorization: `Bearer ${token}` };
  const branches = (await (await request.get("/api/v2/branches", { headers })).json()).data as {
    id: string;
    code: string;
  }[];
  const branch = branches.find((b) => b.code === branchCode);
  if (!branch) return;
  const staff = (
    await (
      await request.get(`/api/v2/staff?branchId=${branch.id}&pageSize=100`, { headers })
    ).json()
  ).data as { id: string }[];
  for (const member of staff) await request.delete(`/api/v2/staff/${member.id}`, { headers });
  const tables = (
    await (await request.get(`/api/v2/tables?branchId=${branch.id}`, { headers })).json()
  ).data as { id: string }[];
  for (const table of tables) await request.delete(`/api/v2/tables/${table.id}`, { headers });
  await request.delete(`/api/v2/branches/${branch.id}`, { headers });
});

test("owner builds a branch with staff and a floor; waiter sees live table updates", async ({
  page,
  browser,
}) => {
  // ── Owner creates a branch ──────────────────────────────────────
  await signIn(page, "owner@smartdine.test");
  await expect(page).toHaveURL(/\/app\/owner/);
  await page.getByRole("link", { name: "Branches" }).click();
  await page.getByRole("button", { name: "New branch" }).click();
  const branchDialog = page.getByRole("dialog", { name: "New branch" });
  await branchDialog.getByLabel("Name").fill(branchName);
  await branchDialog.getByLabel("Code").fill(branchCode);
  await branchDialog.getByLabel("City").fill("Kandy");
  await branchDialog.getByRole("button", { name: "Create branch" }).click();
  await expect(page.getByRole("main").getByText(branchName)).toBeVisible();

  // Switch the working branch to the new one.
  await page.getByLabel("Working branch").selectOption({ label: branchName });

  // ── Owner adds a waiter ─────────────────────────────────────────
  await page.getByRole("link", { name: "Staff" }).click();
  await expect(page.getByText("No staff in this branch")).toBeVisible();
  await page.getByRole("button", { name: "New staff member" }).first().click();
  const staffDialog = page.getByRole("dialog", { name: "New staff member" });
  await staffDialog.getByLabel("First name").fill("Wanda");
  await staffDialog.getByLabel("Last name").fill("Waiter");
  await staffDialog.getByLabel("Email").fill(waiterEmail);
  await staffDialog.getByLabel("Initial password").fill(DEMO_PASSWORD);
  await staffDialog.getByLabel("Department").fill("Service");
  await staffDialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(waiterEmail)).toBeVisible();

  // ── Owner configures the floor ──────────────────────────────────
  await page.getByRole("link", { name: "Floor plan" }).click();
  await expect(page.getByText("No floors configured")).toBeVisible();
  await page.getByRole("button", { name: "Create a floor" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Main hall");
  await page.getByRole("button", { name: "Save area" }).click();
  await expect(page.getByRole("tab", { name: "Main hall" })).toBeVisible();

  await page.getByRole("button", { name: "Edit layout" }).click();
  await page.getByRole("button", { name: "Add table" }).click();
  await expect(page.getByRole("button", { name: /^Table 1,/ })).toBeVisible();
  await page.getByRole("button", { name: "Add table" }).click();
  await expect(page.getByRole("button", { name: /^Table 2,/ })).toBeVisible();

  // Assign the waiter to table 1 via the inspector.
  await page.getByRole("button", { name: /^Table 1,/ }).click();
  const inspector = page.getByRole("complementary", { name: "Table 1 details" });
  await inspector.getByLabel("Assigned waiter").selectOption({ label: "Wanda Waiter" });
  await inspector.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: /^Table 1,.*waiter Wanda Waiter/ })).toBeVisible();
  // Let the inspector finish loading before measuring: a late-arriving section would shift the layout.
  await expect(inspector.getByText("No open orders.")).toBeVisible();

  // Drag table 1 and confirm the new position survives a reload.
  const table1 = page.getByRole("button", { name: /^Table 1,/ });
  await table1.scrollIntoViewIfNeeded();
  const before = await table1.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width / 2 + 200, before!.y + before!.height / 2 + 100, {
    steps: 8,
  });
  const layoutSaved = page.waitForResponse((r) => r.url().includes("/tables/layout") && r.ok());
  await page.mouse.up();
  const moved = await table1.boundingBox();
  expect(Math.round(moved!.x - before!.x)).toBe(200);
  expect(Math.round(moved!.y - before!.y)).toBe(100);

  await layoutSaved;
  await page.reload();
  // Compare against the canvas origin: the reload resets the page scroll.
  const canvas = page.getByRole("group", { name: "Main hall floor plan" });
  const reloaded = await page.getByRole("button", { name: /^Table 1,/ }).boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(Math.round(reloaded!.x - canvasBox!.x)).toBe(20 + 200);
  expect(Math.round(reloaded!.y - canvasBox!.y)).toBe(20 + 100);

  // ── A waiter signed in elsewhere sees live status changes ───────
  const waiterContext = await browser.newContext();
  const waiterPage = await waiterContext.newPage();
  await signIn(waiterPage, waiterEmail);
  await expect(waiterPage).toHaveURL(/\/app\/waiter/);
  await waiterPage.getByRole("link", { name: "Floor plan" }).click();
  await expect(waiterPage.getByRole("button", { name: /^Table 1,.*Available/ })).toBeVisible();
  // Floor staff cannot edit the layout.
  await expect(waiterPage.getByRole("button", { name: "Edit layout" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Table 1,/ }).click();
  await page
    .getByRole("complementary", { name: "Table 1 details" })
    .getByLabel("Status")
    .selectOption({ label: "Occupied" });

  // No reload on the waiter's screen: the socket pushes the change.
  await expect(waiterPage.getByRole("button", { name: /^Table 1,.*Occupied/ })).toBeVisible();

  // The waiter can change status themselves, and the owner sees it live.
  await waiterPage.getByRole("button", { name: /^Table 1,/ }).click();
  await waiterPage
    .getByRole("complementary", { name: "Table 1 details" })
    .getByLabel("Status")
    .selectOption({ label: "Payment pending" });
  await expect(page.getByRole("button", { name: /^Table 1,.*Payment pending/ })).toBeVisible();

  await waiterContext.close();
});

test("role-restricted areas are blocked in the UI", async ({ page }) => {
  await signIn(page, "waiter@smartdine.test");
  await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Branches" })).toHaveCount(0);
  await page.goto("/app/staff");
  await expect(page.getByText("Access denied")).toBeVisible();
});

test("kitchen staff cannot see the floor plan", async ({ page }) => {
  await signIn(page, "kitchen@smartdine.test");
  await expect(page.getByRole("link", { name: "Floor plan" })).toHaveCount(0);
  await page.goto("/app/floor-plan");
  await expect(page.getByText("Access denied")).toBeVisible();
});

test("customers cannot enter the staff app", async ({ page }) => {
  await signIn(page, "customer@smartdine.test");
  await expect(page).toHaveURL(/\/account/);
  await page.goto("/app/manager");
  await expect(page.getByText("Access denied")).toBeVisible();
});
