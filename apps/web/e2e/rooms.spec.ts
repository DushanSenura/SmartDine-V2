import { expect, test } from "@playwright/test";

import { apiToken, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

/** A date `days` ahead (UTC calendar date; far enough out to be inside free-cancellation). */
const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const api = (token: string) => ({ Authorization: `Bearer ${token}` });

test.afterAll(async ({ request }) => {
  // Leave the demo hotel as we found it, even if a test failed half way.
  const token = await apiToken(request, "manager@smartdine.test");
  const headers = api(token);
  const bookings = (await (await request.get("/api/v2/room-bookings", { headers })).json())
    .data as {
    id: string;
    status: string;
    guestName: string;
  }[];
  for (const b of bookings) {
    if (b.status === "CHECKED_IN")
      await request.patch(`/api/v2/room-bookings/${b.id}/status`, {
        headers,
        data: { status: "CHECKED_OUT" },
      });
    else if (["CONFIRMED", "PENDING"].includes(b.status) && b.guestName.startsWith("E2E")) {
      await request.patch(`/api/v2/room-bookings/${b.id}/status`, {
        headers,
        data: { status: "CANCELLED" },
      });
    }
  }
  const rooms = (await (await request.get("/api/v2/rooms", { headers })).json()).data as {
    id: string;
    roomNumber: string;
    housekeepingStatus: string;
  }[];
  for (const room of rooms) {
    if (room.roomNumber === "999") await request.delete(`/api/v2/rooms/${room.id}`, { headers });
    else if (room.housekeepingStatus !== "CLEAN") {
      await request.patch(`/api/v2/housekeeping/rooms/${room.id}`, {
        headers,
        data: { housekeepingStatus: "CLEAN" },
      });
    }
  }
  const types = (await (await request.get("/api/v2/room-types/admin", { headers })).json())
    .data as { id: string; name: string }[];
  for (const t of types.filter((t) => t.name.startsWith("E2E"))) {
    await request.delete(`/api/v2/room-types/${t.id}`, { headers });
  }
});

test("a guest searches, books a room (signing in mid-way) and cancels the stay", async ({
  page,
}) => {
  // Book two weeks out so the stay is well inside the free-cancellation window.
  await page.goto(`/rooms?checkIn=${inDays(14)}&checkOut=${inDays(16)}&adults=2&children=0`);
  await expect(page.getByRole("heading", { level: 1, name: "Stay with us" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Standard Room" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deluxe Room" })).toBeVisible();

  // Three adults rule out the two-guest Standard Room.
  await page.getByRole("button", { name: "More adults" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: "Standard Room" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Deluxe Room" })).toBeVisible();
  await expect(page).toHaveURL(/adults=3/);

  // Room details carry the search and show the price breakdown.
  await page
    .getByRole("listitem")
    .filter({ hasText: "Deluxe Room" })
    .getByRole("link", { name: "Details" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Deluxe Room" })).toBeVisible();
  await expect(page.getByText("What's included")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Your stay" }).getByText("Total"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Book this room" }).click();

  // Extras update the price summary live.
  await expect(page.getByRole("heading", { name: "Book Deluxe Room" })).toBeVisible();
  const summary = page.getByRole("complementary", { name: "Price summary" });
  await expect(summary.getByText("Breakfast")).toHaveCount(0);
  await page.getByLabel(/Breakfast/).check();
  await expect(summary.getByText("Breakfast")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Full name").fill("E2E Guest");
  await page.getByLabel("Phone").fill("+94 77 123 4567");
  await page.getByLabel("Email").fill("e2e.guest@example.com");
  await page.getByLabel(/Special requests/).fill("High floor please");
  await page.getByRole("button", { name: "Review booking" }).click();
  await expect(page.getByText("High floor please")).toBeVisible();

  // Confirming needs an account; the booking is resumed after signing in.
  await expect(page.getByText(/Sign in or create an account to confirm/)).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill("customer@smartdine.test");
  await page.getByLabel("Password").fill(process.env.SEED_DEMO_PASSWORD ?? "Demo-Passw0rd-2026");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/rooms\/deluxe-room\/book\?.*adults=3/);
  await expect(page.getByText("High floor please")).toBeVisible(); // draft restored
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByRole("heading", { name: "Your room is booked" })).toBeVisible();
  const reference = (await page.getByText(/^RM-[A-Z2-9]{6}$/).textContent())!.trim();

  await page.getByRole("link", { name: "View my stays" }).click();
  await expect(page).toHaveURL(/\/account\/stays$/);
  const card = page.getByRole("listitem").filter({ hasText: reference });
  await expect(card.getByText("Confirmed")).toBeVisible();
  await expect(card.getByText(/Deluxe Room/)).toBeVisible();

  await card.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(card.getByText("Cancelled")).toBeVisible();
});

test("front desk checks a guest in and out; housekeeping returns the room to service live", async ({
  page,
  browser,
}) => {
  const guest = `E2E Walk-in ${Date.now().toString(36)}`;
  await signIn(page, "manager@smartdine.test");
  await page.getByRole("link", { name: "Room bookings" }).click();

  // Phone / walk-in booking for tonight.
  await page.getByRole("button", { name: "New booking" }).click();
  const dialog = page.getByRole("dialog", { name: "New room booking" });
  await dialog.getByRole("button", { name: /Standard Room/ }).click();
  await dialog.getByLabel("Guest name").fill(guest);
  await dialog.getByLabel("Phone").fill("+94 71 111 2222");
  await dialog.getByLabel("Email").fill("walkin@example.com");
  await dialog.getByRole("button", { name: "Create booking" }).click();

  const row = page.getByRole("listitem").filter({ hasText: guest });
  await expect(row.getByText("Confirmed")).toBeVisible();
  const roomNumber = /Room (\d+)/.exec((await row.textContent()) ?? "")![1]!;

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
  await expect(row.getByRole("button", { name: "Change room" })).toHaveCount(0); // arrived: room is fixed

  // The inventory shows the room occupied by this guest.
  await page.getByRole("link", { name: "Room inventory" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Room inventory" })).toBeVisible();
  const tile = page.getByRole("listitem").filter({ hasText: new RegExp(`^${roomNumber}(?!\\d)`) });
  await expect(tile.locator("span").filter({ hasText: /^Occupied$/ })).toBeVisible();
  await expect(tile.getByText(guest)).toBeVisible();

  // Check out → the room goes dirty and a cleaning task appears.
  await page.getByRole("link", { name: "Room bookings" }).click();
  await row.getByRole("button", { name: "Check out" }).click();
  await expect(row.getByText("Checked out")).toBeVisible();

  await page.getByRole("link", { name: "Housekeeping" }).click();
  const task = page
    .getByRole("listitem")
    .filter({ hasText: `Room ${roomNumber} · Check-out clean` });
  await expect(task).toBeVisible();

  // A waiter (floor staff) cleans the room from another device; the manager's screen updates live.
  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await signIn(waiter, "waiter@smartdine.test");
  await expect(waiter.getByRole("link", { name: "Room bookings" })).toHaveCount(0); // not front-desk staff
  await waiter.getByRole("link", { name: "Housekeeping" }).click();
  const waiterTask = waiter
    .getByRole("listitem")
    .filter({ hasText: `Room ${roomNumber} · Check-out clean` });
  await waiterTask.getByRole("button", { name: "Mark clean" }).click();
  await expect(waiterTask).toHaveCount(0);

  await expect(task).toHaveCount(0); // gone on the manager's screen without a reload
  await waiter.goto("/app/rooms/bookings");
  await expect(waiter.getByText("Access denied")).toBeVisible();
  await waiterContext.close();

  await page.getByRole("link", { name: "Room inventory" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Room inventory" })).toBeVisible();
  await expect(tile.locator("span").filter({ hasText: /^Available$/ })).toBeVisible();
  await expect(tile.getByText("Clean", { exact: true })).toBeVisible();
});

test("a manager creates a room type and room, and cannot delete a type that still has rooms", async ({
  page,
}) => {
  await signIn(page, "manager@smartdine.test");
  await page.getByRole("link", { name: "Room types" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Room types" })).toBeVisible();

  await page.getByRole("button", { name: "New room type" }).click();
  const typeDialog = page.getByRole("dialog", { name: "New room type" });
  await typeDialog.getByLabel("Name", { exact: true }).fill("E2E Penthouse");
  await typeDialog.getByLabel("Maximum guests").fill("4");
  await typeDialog.getByLabel("Base price / night").fill("90000");
  await typeDialog.getByLabel("Weekend price / night").fill("110000");
  await typeDialog.getByLabel("Bathtub").check();
  await typeDialog.getByRole("button", { name: "Save room type" }).click();
  await expect(
    page
      .getByRole("heading", { name: /E2E Penthouse/ })
      .or(page.getByText("E2E Penthouse").first()),
  ).toBeVisible();

  await page.getByRole("link", { name: "Room inventory" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Room inventory" })).toBeVisible();
  await page.getByRole("button", { name: "New room" }).click();
  const roomDialog = page.getByRole("dialog", { name: "New room" });
  await roomDialog.getByLabel("Room number").fill("999");
  await roomDialog.getByLabel("Floor").fill("9");
  await roomDialog.getByLabel("Room type").selectOption({ label: "E2E Penthouse" });
  await roomDialog.getByRole("button", { name: "Save room" }).click();
  const tile = page.getByRole("listitem").filter({ hasText: /^999(?!\d)/ });
  await expect(tile).toBeVisible();

  // The type cannot be removed while it has rooms.
  await page.getByRole("link", { name: "Room types" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Room types" })).toBeVisible();
  await page.getByRole("button", { name: "Delete E2E Penthouse" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Remove or move");
  await page.keyboard.press("Escape");

  // Remove the room, then the type.
  await page.getByRole("link", { name: "Room inventory" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Room inventory" })).toBeVisible();
  await page.getByRole("button", { name: "Delete room 999" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(tile).toHaveCount(0);
  await page.getByRole("link", { name: "Room types" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Room types" })).toBeVisible();
  await page.getByRole("button", { name: "Delete E2E Penthouse" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("E2E Penthouse")).toHaveCount(0);
});
