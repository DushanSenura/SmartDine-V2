import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  actor,
  cleanupBranches,
  cleanupMenu,
  cleanupUsers,
  prisma,
  setupDatabase,
} from "./helpers";
import {
  api,
  attach,
  newPromotion,
  openBill,
  payCash,
  pinRates,
  restaurant,
  type World,
} from "./fixtures";

let restoreRates: () => Promise<void>;
let owner: Awaited<ReturnType<typeof actor>>;

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  restoreRates = await pinRates(true);
  owner = await actor("OWNER");
});
afterEach(async () => {
  await prisma.promotion.deleteMany({ where: { name: { startsWith: "IT " } } });
});
afterAll(async () => {
  await restoreRates();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});

const applyCode = (w: World, billId: string, code: string) =>
  api("put", `/bills/${billId}/promo`, w.cashier.token).send({ code });
const usedCount = async (code: string) =>
  (await prisma.promotion.findFirstOrThrow({ where: { code } })).usedCount;
const promoIn = (list: { code: string | null }[], code: string) =>
  list.find((p) => p.code === code);

describe("promo codes on a bill", () => {
  it("applies a percentage code with no cashier cap, and takes it off again", async () => {
    const w = await restaurant("P1");
    await newPromotion(owner.token, { code: "save20" }).expect(201); // stored upper-case
    const { bill } = await openBill(w, [w.burger.id]); // 1000 → 1155 total

    const applied = await applyCode(w, bill.id, " save20 ");
    expect(applied.status).toBe(200);
    // 20% > the 10% cashier limit, but a code is pre-approved by management.
    // 1000 − 200 = 800; +10% = 880; +5% = 924
    expect(applied.body.data).toMatchObject({
      discountAmount: 200,
      total: 924,
      promotionCode: "SAVE20",
      discountReason: "Promo SAVE20",
    });
    expect(await usedCount("SAVE20")).toBe(1);

    const removed = await api("delete", `/bills/${bill.id}/promo`, w.cashier.token);
    expect(removed.body.data).toMatchObject({
      discountAmount: 0,
      total: 1155,
      promotionCode: null,
    });
    expect(await usedCount("SAVE20")).toBe(0);
    expect((await api("delete", `/bills/${bill.id}/promo`, w.cashier.token)).body.error.code).toBe(
      "NO_PROMO",
    );
  });

  it("supports fixed-amount codes and re-applying the same code is harmless", async () => {
    const w = await restaurant("P2");
    await newPromotion(owner.token, { code: "LKR150", type: "FIXED", value: 150 }).expect(201);
    const { bill } = await openBill(w, [w.burger.id]);
    const first = await applyCode(w, bill.id, "LKR150");
    // 1000 − 150 = 850; +10% = 935; +5% = 981.75
    expect(first.body.data).toMatchObject({ discountAmount: 150, total: 981.75 });
    await applyCode(w, bill.id, "LKR150").expect(200);
    expect(await usedCount("LKR150")).toBe(1); // not counted twice
  });

  it("rejects unknown codes and promotions that don't apply", async () => {
    const w = await restaurant("P3");
    const customer = await actor("CUSTOMER");
    const { bill } = await openBill(w, [w.soup.id]); // subtotal 500

    expect((await applyCode(w, bill.id, "NOPE")).body.error.code).toBe("PROMO_INVALID");
    await newPromotion(owner.token, { code: "OLD", endsOn: "2020-01-01" }).expect(201);
    await newPromotion(owner.token, { code: "SOON", startsOn: "2999-01-01" }).expect(201);
    await newPromotion(owner.token, { code: "BIG", minimumSpend: 5000 }).expect(201);
    await newPromotion(owner.token, { code: "OFF", active: false }).expect(201);
    await newPromotion(owner.token, { code: "VIP", customerIds: [customer.userId] }).expect(201);
    await newPromotion(owner.token, {
      code: "ELSEWHERE",
      branchIds: [(await restaurant("P3b")).branch.id],
    }).expect(201);
    await newPromotion(owner.token, {
      name: "IT Points",
      code: "MULTI",
      type: "LOYALTY_MULTIPLIER",
      value: 2,
    }).expect(201);

    for (const code of ["OLD", "SOON", "BIG", "OFF", "VIP", "ELSEWHERE"]) {
      const res = await applyCode(w, bill.id, code);
      expect(res.status, code).toBe(409);
      expect(res.body.error.code, code).toBe("PROMO_NOT_APPLICABLE");
    }
    expect((await applyCode(w, bill.id, "MULTI")).body.error.code).toBe("PROMO_INVALID"); // not a bill discount

    // Attaching the right customer unlocks the customer-only code.
    await attach(w, bill.id, customer.userId);
    expect((await applyCode(w, bill.id, "VIP")).status).toBe(200);
    // …and detaching them takes it back off again.
    const detached = await attach(w, bill.id, null);
    expect(detached.body.data).toMatchObject({ promotionCode: null, discountAmount: 0 });
    expect(await usedCount("VIP")).toBe(0);
  });

  it("limits a happy-hour code to its window", async () => {
    const w = await restaurant("P4");
    const nowIso = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Colombo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
    const hour = Number(nowIso.slice(0, 2));
    const pad = (n: number) => String(n).padStart(2, "0");
    const around = {
      startTime: `${pad((hour + 23) % 24)}:00`,
      endTime: `${pad((hour + 1) % 24)}:59`,
    };
    const away = { startTime: `${pad((hour + 6) % 24)}:00`, endTime: `${pad((hour + 7) % 24)}:00` };
    await newPromotion(owner.token, {
      code: "HAPPY",
      type: "HAPPY_HOUR",
      value: 15,
      ...around,
    }).expect(201);
    await newPromotion(owner.token, {
      code: "LATER",
      type: "HAPPY_HOUR",
      value: 15,
      ...away,
    }).expect(201);
    const { bill } = await openBill(w, [w.soup.id]);
    expect((await applyCode(w, bill.id, "HAPPY")).status).toBe(200);
    const later = await applyCode(w, bill.id, "LATER");
    expect(later.body.error.code).toBe("PROMO_NOT_APPLICABLE");
    expect(later.body.error.message).toContain("isn't running");
    expect(await usedCount("HAPPY")).toBe(1); // a rejected code never disturbs the one in place
  });

  it("replaces one code with another and a hand-typed discount releases the code's use", async () => {
    const w = await restaurant("P5");
    await newPromotion(owner.token, { code: "ONE", value: 10 }).expect(201);
    await newPromotion(owner.token, { code: "TWO", value: 30 }).expect(201);
    const { bill } = await openBill(w, [w.burger.id]);
    await applyCode(w, bill.id, "ONE").expect(200);
    const swapped = await applyCode(w, bill.id, "TWO");
    expect(swapped.body.data).toMatchObject({ promotionCode: "TWO", discountAmount: 300 });
    expect(await usedCount("ONE")).toBe(0);
    expect(await usedCount("TWO")).toBe(1);

    const manual = await api("patch", `/bills/${bill.id}/discount`, w.cashier.token).send({
      type: "PERCENT",
      value: 5,
      reason: "Regular guest",
    });
    expect(manual.body.data).toMatchObject({ promotionCode: null, discountAmount: 50 });
    expect(await usedCount("TWO")).toBe(0);
  });

  it("counts a use only until the bill is voided", async () => {
    const w = await restaurant("P6");
    await newPromotion(owner.token, { code: "GONE" }).expect(201);
    const { bill, orderId } = await openBill(w, [w.soup.id]);
    await applyCode(w, bill.id, "GONE").expect(200);
    expect(await usedCount("GONE")).toBe(1);
    await api("post", `/orders/${orderId}/cancel`, w.manager.token)
      .send({ reason: "Walked out" })
      .expect(200);
    expect(await usedCount("GONE")).toBe(0);
  });

  it("never hands out more uses than the limit when cashiers race for the last one", async () => {
    const w = await restaurant("P7");
    await newPromotion(owner.token, { code: "LAST", usageLimit: 1 }).expect(201);
    const bills = await Promise.all([0, 1, 2].map((i) => openBill(w, [w.soup.id], i)));
    const results = await Promise.all(bills.map((b) => applyCode(w, b.bill.id, "LAST")));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.error?.code === "PROMO_LIMIT_REACHED")).toHaveLength(2);
    expect(await usedCount("LAST")).toBe(1);
  });

  it("settles a 100% code immediately and can't be changed once paid", async () => {
    const w = await restaurant("P8");
    await newPromotion(owner.token, { code: "FREE", value: 100 }).expect(201);
    const { bill } = await openBill(w, [w.soup.id]);
    const res = await applyCode(w, bill.id, "FREE");
    expect(res.body.data).toMatchObject({ status: "PAID", total: 0, orderStatus: "COMPLETED" });

    const paid = await openBill(w, [w.soup.id], 1);
    await payCash(w, paid.bill.id, 100).expect(201);
    await newPromotion(owner.token, { code: "LATE" }).expect(201);
    expect((await applyCode(w, paid.bill.id, "LATE")).body.error.code).toBe("BILL_HAS_PAYMENTS");
  });
});

describe("managing promotions", () => {
  it("validates input and keeps codes unique", async () => {
    expect((await newPromotion(owner.token, { value: 150 })).status).toBe(400); // > 100%
    expect((await newPromotion(owner.token, { type: "FIXED", value: 0 })).status).toBe(400);
    expect(
      (await newPromotion(owner.token, { type: "LOYALTY_MULTIPLIER", value: 0.5 })).status,
    ).toBe(400);
    expect(
      (await newPromotion(owner.token, { startsOn: "2026-02-01", endsOn: "2026-01-01" })).status,
    ).toBe(400);
    expect((await newPromotion(owner.token, { startTime: "16:00" })).status).toBe(400); // needs an end
    expect((await newPromotion(owner.token, { code: "bad code!" })).status).toBe(400);
    expect((await newPromotion(owner.token, { name: "" })).status).toBe(400);

    await newPromotion(owner.token, { code: "DUP" }).expect(201);
    const dup = await newPromotion(owner.token, { code: "dup" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("PROMO_CODE_TAKEN");
  });

  it("updates without resetting what wasn't sent, and frees the code when archived", async () => {
    const created = await newPromotion(owner.token, {
      code: "KEEP",
      minimumSpend: 2000,
      usageLimit: 5,
      daysOfWeek: [6, 7],
      active: false,
    });
    const id = created.body.data.id as string;
    const patched = await api("patch", `/promotions/${id}`, owner.token).send({
      name: "IT Renamed",
    });
    expect(patched.body.data).toMatchObject({
      name: "IT Renamed",
      code: "KEEP",
      minimumSpend: 2000,
      usageLimit: 5,
      daysOfWeek: [6, 7],
      active: false, // a rename must not re-activate it
    });

    await api("delete", `/promotions/${id}`, owner.token).expect(200);
    expect(
      promoIn((await api("get", "/promotions", owner.token)).body.data, "KEEP"),
    ).toBeUndefined();
    await newPromotion(owner.token, { code: "KEEP" }).expect(201); // the code is free again
  });

  it("lets a manager manage only promotions confined to their own branch", async () => {
    const a = await restaurant("M1a");
    const b = await restaurant("M1b");
    const own = await newPromotion(a.manager.token, { code: "MINE", branchIds: [a.branch.id] });
    expect(own.status).toBe(201);
    expect((await newPromotion(a.manager.token, { code: "ALL" })).status).toBe(403); // company-wide
    expect(
      (await newPromotion(a.manager.token, { code: "THEIRS", branchIds: [b.branch.id] })).status,
    ).toBe(403);

    const global = (await newPromotion(owner.token, { code: "GLOBAL" })).body.data;
    expect(
      (await api("patch", `/promotions/${global.id}`, a.manager.token).send({ name: "IT Hacked" }))
        .status,
    ).toBe(403);
    expect((await api("delete", `/promotions/${global.id}`, a.manager.token)).status).toBe(403);

    const seenByA = (await api("get", "/promotions", a.manager.token)).body.data;
    expect(promoIn(seenByA, "MINE")).toBeDefined();
    expect(promoIn(seenByA, "GLOBAL")).toBeDefined(); // visible, just not editable
    const seenByB = (await api("get", "/promotions", b.manager.token)).body.data;
    expect(promoIn(seenByB, "MINE")).toBeUndefined();

    for (const role of ["WAITER", "KITCHEN", "CASHIER"] as const) {
      expect((await api("get", "/promotions", (await actor(role, a.branch.id)).token)).status).toBe(
        403,
      );
    }
  });

  it("shows guests only live, public offers — never codes, limits or customer lists", async () => {
    const w = await restaurant("O1");
    const customer = await actor("CUSTOMER");
    await newPromotion(owner.token, {
      name: "IT Weekend brunch",
      type: "SEASONAL_OFFER",
      value: 0,
      code: "SECRET",
      usageLimit: 9,
    }).expect(201);
    await newPromotion(owner.token, {
      name: "IT Members only",
      code: "VIPONLY",
      customerIds: [customer.userId],
    }).expect(201);
    await newPromotion(owner.token, { name: "IT Expired", endsOn: "2020-01-01" }).expect(201);
    await newPromotion(owner.token, {
      name: "IT Elsewhere",
      branchIds: [(await restaurant("O1b")).branch.id],
    }).expect(201);
    await newPromotion(owner.token, { name: "IT Hidden", active: false }).expect(201);

    const res = await api("get", `/public/offers?branchId=${w.branch.id}`);
    expect(res.status).toBe(200);
    const names = res.body.data
      .filter((o: { name: string }) => o.name.startsWith("IT "))
      .map((o: { name: string }) => o.name);
    expect(names).toEqual(["IT Weekend brunch"]);
    const offer = res.body.data.find((o: { name: string }) => o.name === "IT Weekend brunch");
    expect(Object.keys(offer)).not.toContain("code");
    expect(Object.keys(offer)).not.toContain("usageLimit");
    expect(Object.keys(offer)).not.toContain("customerIds");
  });
});
