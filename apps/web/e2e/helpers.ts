import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo-Passw0rd-2026";

export async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** API login for test setup / cleanup (bypasses the UI). */
export async function apiToken(
  request: APIRequestContext,
  email: string,
  password = DEMO_PASSWORD,
) {
  const res = await request.post("/api/v2/auth/login", { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.accessToken as string;
}

export const API = "/api/v2";
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export type Table = { id: string; branchId: string; tableNumber: string; status: string };

/** Takes a fresh order through the real endpoints up to "bill requested" and returns it. */
export async function billRequestedOrder(request: APIRequestContext, tableIndex: number) {
  const [waiter, kitchen, manager] = await Promise.all([
    apiToken(request, "waiter@smartdine.test"),
    apiToken(request, "kitchen@smartdine.test"),
    apiToken(request, "manager@smartdine.test"),
  ]);
  const tables = (await (await request.get(`${API}/tables`, { headers: auth(manager) })).json())
    .data as Table[];
  const table = tables.filter((t) => t.status !== "OUT_OF_SERVICE")[tableIndex]!;
  const menu = (await (await request.get(`${API}/menu?branchId=${table.branchId}`)).json()).data
    .items as { id: string; name: string; modifiers: unknown[]; isAvailableNow: boolean }[];
  const dishes = menu.filter((m) => m.isAvailableNow && m.modifiers.length === 0).slice(0, 2);

  const created = await request.post(`${API}/orders`, {
    headers: auth(waiter),
    data: {
      type: "DINE_IN",
      tableId: table.id,
      guestName: "E2E Payer",
      items: dishes.map((d) => ({ menuItemId: d.id, quantity: 2, modifierIds: [] })),
    },
  });
  const body = await created.json();
  expect(created.ok(), JSON.stringify(body)).toBeTruthy();
  const order = body.data as { id: string; orderNumber: string };
  await request.post(`${API}/orders/${order.id}/approve`, { headers: auth(waiter) });
  await request.post(`${API}/kitchen/orders/${order.id}/ready`, {
    headers: auth(kitchen),
    data: {},
  });
  await request.post(`${API}/orders/${order.id}/serve`, { headers: auth(waiter), data: {} });
  await request.post(`${API}/orders/${order.id}/request-payment`, { headers: auth(waiter) });
  return { ...order, table };
}

/** Leaves the demo floor as we found it: no open orders, no tables left mid-service. */
export async function resetFloor(request: APIRequestContext) {
  const headers = auth(await apiToken(request, "manager@smartdine.test"));
  const open = (await (await request.get(`${API}/orders?scope=active`, { headers })).json())
    .data as { id: string }[] | undefined;
  for (const o of open ?? []) {
    await request.post(`${API}/orders/${o.id}/cancel`, {
      headers,
      data: { reason: "e2e cleanup" },
    });
  }
  const tables = (await (await request.get(`${API}/tables`, { headers })).json()).data as Table[];
  // Anything left mid-service by a test goes back to available (reserved and out-of-service stay).
  const midService = [
    "CLEANING",
    "PAYMENT_PENDING",
    "OCCUPIED",
    "ORDERING",
    "WAITING_FOR_FOOD",
    "DINING",
  ];
  for (const t of tables.filter((t) => midService.includes(t.status))) {
    await request.patch(`${API}/tables/${t.id}/status`, { headers, data: { status: "AVAILABLE" } });
  }
}
