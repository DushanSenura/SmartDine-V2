import { expect, test, type Page } from "@playwright/test";

import { apiToken, signIn } from "./helpers";

/** A menu card. Its heart button also carries the dish name, so select the card, not "a button named …". */
const dishCard = (page: Page, name: RegExp) => page.getByRole("listitem").filter({ hasText: name });

const SEVEN_PM = /^7:00\sPM$/;

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  // A failed run must not leave its test dish on the live menu.
  const token = await apiToken(request, "manager@smartdine.test");
  const headers = { Authorization: `Bearer ${token}` };
  const items = (await (await request.get("/api/v2/menu/admin", { headers })).json()).data as {
    id: string;
    name: string;
  }[];
  for (const item of items.filter((i) => i.name.startsWith("E2E Special"))) {
    await request.delete(`/api/v2/menu/items/${item.id}`, { headers });
  }
});

async function bookTableAsGuest(page: Page) {
  await page.goto("/reservations");
  await expect(page.getByRole("heading", { name: "Reserve a table" })).toBeVisible();
  // The default date is tomorrow, which falls inside the free-cancellation window once it is
  // evening today. Book three days out so the guest can always cancel, whatever time the test runs.
  await page.getByRole("button", { name: "Next day" }).click();
  await page.getByRole("button", { name: "Next day" }).click();
  await page.getByRole("button", { name: SEVEN_PM }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Where would you like to sit?")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Phone").fill("+94 77 123 4567");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel(/Special requests/).fill("Window seat please");
  await page.getByRole("button", { name: "Review booking" }).click();
  await expect(page.getByText("Window seat please")).toBeVisible();
}

test("a visitor can browse the home page and menu without signing in or scanning anything", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A table, a celebration");
  // No QR concepts anywhere in the public UI.
  await expect(page.getByText(/qr/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Featured dishes" })).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Menu" }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.getByRole("heading", { name: "Made to be shared" })).toBeVisible();
  await expect(dishCard(page, /Black Pepper Beef Tenderloin/)).toBeVisible();

  // Search narrows the menu.
  await page.getByRole("searchbox", { name: "Search dishes" }).fill("burger");
  await expect(dishCard(page, /SmartDine Smash Burger/)).toBeVisible();
  await expect(dishCard(page, /Black Pepper Beef Tenderloin/)).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search dishes" }).fill("");

  // Dietary filter.
  await page.getByRole("button", { name: "Vegan", exact: true }).click();
  await expect(dishCard(page, /Roasted Pumpkin Soup/)).toBeVisible();
  await expect(dishCard(page, /Margherita/)).toHaveCount(0);
  await page.getByRole("button", { name: "Vegan", exact: true }).click();

  // Category tabs.
  await page.getByRole("tab", { name: "Desserts" }).click();
  await expect(dishCard(page, /Chocolate Fondant/)).toBeVisible();
  await expect(dishCard(page, /Margherita/)).toHaveCount(0);

  // Details show allergens, calories, and related dishes.
  await dishCard(page, /Chocolate Fondant/)
    .getByRole("button")
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /Chocolate Fondant/ });
  await expect(dialog.getByText(/Contains: .*gluten/)).toBeVisible();
  await expect(dialog.getByText("560 kcal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // The other public pages render.
  for (const [link, heading] of [
    ["Contact", "Visit or get in touch"],
    ["About", "Food, people and a good table"],
    ["Offers", "Seasonal offers"],
    ["Rooms", "Stay with us"],
    ["Gallery", "A look inside"],
  ] as const) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("a visitor books a table; the draft survives signing in; the customer can then cancel it", async ({
  page,
}) => {
  await bookTableAsGuest(page);

  // Confirming needs an account: the visitor signs in and comes back to the same review step.
  await expect(page.getByText(/Sign in or create an account to confirm/)).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill("customer@smartdine.test");
  await page.getByLabel("Password").fill(process.env.SEED_DEMO_PASSWORD ?? "Demo-Passw0rd-2026");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Back on the booking page (not /account/reservations), with the draft intact.
  await expect(page).toHaveURL(/\/\/[^/]+\/reservations$/);
  await expect(page.getByText("Window seat please")).toBeVisible();
  await page.getByRole("button", { name: "Confirm reservation" }).click();

  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  const reference = (await page.getByText(/^SD-[A-Z2-9]{6}$/).textContent())!.trim();

  await page.getByRole("link", { name: "View my reservations" }).click();
  await expect(page).toHaveURL(/\/account\/reservations$/);
  const card = page.getByRole("listitem").filter({ hasText: reference });
  await expect(card).toBeVisible();
  await expect(card.getByText("Confirmed")).toBeVisible();

  await card.getByRole("button", { name: "Cancel reservation" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel reservation" }).click();
  await expect(card.getByText("Cancelled")).toBeVisible();
});

test("a customer requests a private dining room", async ({ page }) => {
  await signIn(page, "customer@smartdine.test");
  await page.goto("/reservations?tab=private");
  await expect(page.getByRole("heading", { name: "Host your event" })).toBeVisible();

  await page.getByRole("button", { name: /Garden Room/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /^6:00\sPM$/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Full name")).toHaveValue(/Chris Customer/); // prefilled from the account
  await page.getByLabel("Phone").fill("+94 77 123 4567");
  await page.getByRole("button", { name: "Review booking" }).click();

  await expect(page.getByText(/confirmed by our team/)).toBeVisible();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  const reference = (await page.getByText(/^SD-[A-Z2-9]{6}$/).textContent())!.trim();

  await page.goto("/account/reservations");
  const card = page.getByRole("listitem").filter({ hasText: reference });
  await expect(card.getByText("Pending")).toBeVisible();
  await card.getByRole("button", { name: "Cancel reservation" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel reservation" }).click();
  await expect(card.getByText("Cancelled")).toBeVisible();
});

test("staff see new bookings live and take them through the visit", async ({ page, browser }) => {
  // The waiter opens tomorrow's list, then a customer books from another browser.
  await signIn(page, "waiter@smartdine.test");
  await page.getByRole("link", { name: "Reservations" }).click();
  await page.getByRole("button", { name: "Next day" }).click();
  const guestName = `Live Guest ${Date.now().toString(36)}`;

  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  await signIn(customer, "customer@smartdine.test");
  await customer.goto("/reservations");
  await customer.getByRole("button", { name: SEVEN_PM }).click();
  await customer.getByRole("button", { name: "Continue" }).click();
  await customer.getByRole("button", { name: "Continue" }).click();
  await customer.getByLabel("Full name").fill(guestName);
  await customer.getByLabel("Phone").fill("+94 77 123 4567");
  await customer.getByRole("button", { name: "Review booking" }).click();
  await customer.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(customer.getByRole("heading", { name: "You're booked" })).toBeVisible();

  // It appears on the waiter's screen without a reload.
  const row = page.getByRole("listitem").filter({ hasText: guestName });
  await expect(row).toBeVisible();
  await expect(row.getByText("Confirmed")).toBeVisible();

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
  await row.getByRole("button", { name: "Seat" }).click();
  await expect(row.getByText("Seated")).toBeVisible();
  await row.getByRole("button", { name: "Complete" }).click();
  await expect(row.getByText("Completed")).toBeVisible();
  // Completed bookings have no further actions.
  await expect(row.getByRole("button")).toHaveCount(0);

  // The customer's own list reflects the final status.
  await customer.goto("/account/reservations");
  await expect(customer.getByText("Completed").first()).toBeVisible();
  await customerContext.close();
});

test("the kitchen marks a dish sold out and it shows everywhere immediately", async ({
  page,
  browser,
}) => {
  const dish = "Crispy Calamari";

  // A manager has the menu open; the kitchen changes availability in another browser.
  await signIn(page, "manager@smartdine.test");
  await page.getByRole("link", { name: "Menu" }).click();
  const managerSelect = page.getByLabel(`Availability of ${dish}`);
  await expect(managerSelect).toHaveValue("AVAILABLE");

  const kitchenContext = await browser.newContext();
  const kitchen = await kitchenContext.newPage();
  await signIn(kitchen, "kitchen@smartdine.test");
  await kitchen.getByRole("link", { name: "Menu" }).click();
  await expect(kitchen.getByRole("heading", { name: "Dish availability" })).toBeVisible();
  // The kitchen cannot edit or see costs.
  await expect(kitchen.getByRole("button", { name: "New dish" })).toHaveCount(0);
  await expect(kitchen.getByText(/cost \D*\d/)).toHaveCount(0);

  await kitchen.getByLabel(`Availability of ${dish}`).selectOption("SOLD_OUT");
  await expect(managerSelect).toHaveValue("SOLD_OUT"); // live, no reload

  // Guests see it right away.
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto("/menu");
  await dishCard(visitor, new RegExp(dish)).getByRole("button").first().click();
  await expect(visitor.getByRole("dialog").getByRole("status")).toContainText("Sold out");
  await visitorContext.close();

  // Restore.
  await kitchen.getByLabel(`Availability of ${dish}`).selectOption("AVAILABLE");
  await expect(managerSelect).toHaveValue("AVAILABLE");
  await kitchenContext.close();
});

test("a manager can add, edit and remove a dish", async ({ page }) => {
  const name = `E2E Special ${Date.now().toString(36)}`;
  await signIn(page, "manager@smartdine.test");
  await page.getByRole("link", { name: "Menu" }).click();

  await page.getByRole("button", { name: "New dish" }).click();
  const dialog = page.getByRole("dialog", { name: "New dish" });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("Category").selectOption({ label: "Specials" });
  await dialog.getByLabel("Price", { exact: true }).fill("3450");
  await dialog.getByLabel("Short description").fill("Made fresh for the E2E test");
  await dialog.getByLabel("Vegan").check();
  await dialog.getByLabel("Gluten").check();
  await dialog.getByRole("button", { name: "Save dish" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  // It is on the public menu, as vegan and vegetarian, with its allergen.
  const visitor = await page.context().browser()!.newPage();
  await visitor.goto("/menu");
  await visitor.getByRole("searchbox", { name: "Search dishes" }).fill(name);
  await expect(dishCard(visitor, new RegExp(name))).toBeVisible();
  await dishCard(visitor, new RegExp(name)).getByRole("button").first().click();
  await expect(visitor.getByRole("dialog").getByText("Contains: gluten.")).toBeVisible();
  await visitor.close();

  // Edit, then delete.
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  await page.getByRole("dialog").getByLabel("Price", { exact: true }).fill("3650");
  await page.getByRole("dialog").getByRole("button", { name: "Save dish" }).click();
  await expect(page.getByText(/3,650/)).toBeVisible();

  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});
