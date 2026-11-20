import { actor, ALL_DAYS_OPEN, app, bearer, createBranch, prisma, request } from "./helpers";

export const api = (
  method: "get" | "post" | "patch" | "put" | "delete",
  path: string,
  token?: string,
) => {
  const req = request(app)[method](`/api/v2${path}`);
  return token ? req.set(bearer(token)) : req;
};

/**
 * Company-wide rates are shared by every test, so pin them for a run and restore them afterwards:
 * 10% service charge, 5% tax and (optionally) loyalty at 1 point per LKR 100, worth LKR 1 each.
 */
export async function pinRates(loyaltyEnabled = true) {
  const company = await prisma.company.findFirstOrThrow({ where: { deletedAt: null } });
  const original = await prisma.companySettings.findUnique({ where: { companyId: company.id } });
  const rates = {
    taxRatePercent: 5,
    serviceChargePercent: 10,
    loyaltyEnabled,
    loyaltyCurrencyPerPoint: 100,
    loyaltyPointValue: 1,
  };
  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    create: { companyId: company.id, ...rates },
    update: rates,
  });
  return async () => {
    if (original) {
      await prisma.companySettings.update({
        where: { companyId: company.id },
        data: {
          taxRatePercent: original.taxRatePercent,
          serviceChargePercent: original.serviceChargePercent,
          loyaltyEnabled: original.loyaltyEnabled,
          loyaltyCurrencyPerPoint: original.loyaltyCurrencyPerPoint,
          loyaltyPointValue: original.loyaltyPointValue,
        },
      });
    }
  };
}

/** A branch with two tables, two dishes and one of every floor role. */
export async function restaurant(label: string) {
  const branch = await createBranch(label, {
    timezone: "Asia/Colombo",
    openingHours: ALL_DAYS_OPEN,
  });
  const area = await prisma.diningArea.create({ data: { branchId: branch.id, name: "Hall" } });
  const tables = await Promise.all(
    ["1", "2", "3"].map((tableNumber) =>
      prisma.restaurantTable.create({
        data: { branchId: branch.id, diningAreaId: area.id, tableNumber, capacity: 4 },
      }),
    ),
  );
  const category = await prisma.menuCategory.create({
    data: { name: `IT Cust ${label}`, slug: `it-cust-${label.toLowerCase()}-${Date.now()}` },
  });
  const dish = (name: string, price: number) =>
    prisma.menuItem.create({
      data: {
        branchId: branch.id,
        categoryId: category.id,
        name,
        slug: name.toLowerCase(),
        price,
      },
    });
  const burger = await dish("Burger", 1000); // bill: 1155.00
  const soup = await dish("Soup", 500); // bill: 577.50
  const waiter = await actor("WAITER", branch.id);
  const manager = await actor("MANAGER", branch.id);
  const kitchen = await actor("KITCHEN", branch.id);
  const cashier = await actor("CASHIER", branch.id);
  return { branch, tables, burger, soup, waiter, manager, kitchen, cashier };
}
export type World = Awaited<ReturnType<typeof restaurant>>;

/** Takes an order through the real endpoints up to "bill requested" and raises its bill. */
export async function openBill(w: World, itemIds: string[], tableIndex = 0) {
  const created = await api("post", "/orders", w.waiter.token).send({
    type: "DINE_IN",
    tableId: w.tables[tableIndex]!.id,
    items: itemIds.map((menuItemId) => ({ menuItemId, quantity: 1, modifierIds: [] })),
  });
  const id = created.body.data.id as string;
  await api("post", `/orders/${id}/approve`, w.waiter.token).expect(200);
  await api("post", `/kitchen/orders/${id}/ready`, w.kitchen.token).send({}).expect(200);
  await api("post", `/orders/${id}/serve`, w.waiter.token).send({}).expect(200);
  await api("post", `/orders/${id}/request-payment`, w.waiter.token).expect(200);
  const bill = await api("post", "/bills", w.cashier.token).send({ orderId: id });
  return { orderId: id, bill: bill.body.data as BillBody };
}

export interface BillBody {
  id: string;
  total: number;
  balance: number;
  status: string;
  pointsEarned: number;
  discountAmount: number;
  customer: { id: string; points: number } | null;
  loyalty: { enabled: boolean; maxRedeemablePoints: number };
}

export const attach = (w: World, billId: string, customerId: string | null) =>
  api("put", `/bills/${billId}/customer`, w.cashier.token).send({ customerId });

export const payCash = (w: World, billId: string, amount: number) =>
  api("post", `/bills/${billId}/payments`, w.cashier.token).send({ method: "CASH", amount });

export const pointsOf = async (userId: string) =>
  (await prisma.loyaltyAccount.findUnique({ where: { userId } }))?.points ?? 0;

export const newPromotion = (token: string, body: object) =>
  api("post", "/promotions", token).send({
    name: "IT Promo",
    type: "PERCENTAGE",
    value: 20,
    ...body,
  });

/** Notifications are sent without making the request wait, so poll until the expectation holds. */
export async function eventually<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  ms = 3000,
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (ok(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

export interface NotificationBody {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
}

export const inbox = async (token: string) =>
  (await api("get", "/notifications?limit=100", token)).body.data as {
    unreadCount: number;
    notifications: NotificationBody[];
  };
