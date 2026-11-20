import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actor,
  app,
  bearer,
  cleanupBranches,
  cleanupUsers,
  createBranch,
  futureDate,
  prisma,
  request,
  setupDatabase,
} from "./helpers";

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
});
afterAll(async () => {
  await prisma.supplier.deleteMany({ where: { name: { startsWith: "IT " } } });
  await cleanupUsers();
  await cleanupBranches();
  await prisma.$disconnect();
});

const api = (method: "get" | "post" | "patch" | "delete", path: string, token?: string) => {
  const req = request(app)[method](`/api/v2${path}`);
  return token ? req.set(bearer(token)) : req;
};

async function world(label: string) {
  const branch = await createBranch(label);
  const manager = await actor("MANAGER", branch.id);
  return { branch, manager };
}

const newItem = (token: string, extra: object = {}) =>
  api("post", "/inventory/items", token).send({
    name: "Basmati rice",
    sku: `rice-${Math.random().toString(36).slice(2, 8)}`,
    category: "Dry goods",
    unit: "kg",
    quantity: 50,
    minimumQuantity: 10,
    cost: 320,
    ...extra,
  });

describe("stock items", () => {
  it("records opening stock in the audit trail and flags low, empty and expiring stock", async () => {
    const w = await world("I1");
    const created = await newItem(w.manager.token, { sku: "rice-1" });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      sku: "RICE-1",
      quantity: 50,
      status: "IN_STOCK",
      value: 16000,
    });

    const history = await api(
      "get",
      `/inventory/transactions?itemId=${created.body.data.id}`,
      w.manager.token,
    );
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({
      type: "PURCHASE",
      quantityChange: 50,
      quantityAfter: 50,
      note: "Opening stock",
    });

    await newItem(w.manager.token, { sku: "salt", name: "Salt", quantity: 4, minimumQuantity: 5 });
    await newItem(w.manager.token, { sku: "oil", name: "Oil", quantity: 0 });
    await newItem(w.manager.token, {
      sku: "milk",
      name: "Milk",
      quantity: 30,
      minimumQuantity: 5,
      expiryDate: futureDate(3),
    });

    const byStatus = async (status: string) =>
      (await api("get", `/inventory/items?status=${status}`, w.manager.token)).body.data.map(
        (i: { sku: string }) => i.sku,
      );
    expect(await byStatus("LOW_STOCK")).toEqual(["SALT"]);
    expect(await byStatus("OUT_OF_STOCK")).toEqual(["OIL"]);
    expect(await byStatus("EXPIRING")).toEqual(["MILK"]);
    expect(await byStatus("IN_STOCK")).toEqual(["RICE-1"]);

    const summary = await api("get", "/inventory/summary", w.manager.token);
    expect(summary.body.data).toMatchObject({
      itemCount: 4,
      lowStock: 1,
      outOfStock: 1,
      expiring: 1,
    });
  });

  it("keeps SKUs unique within a branch but not across branches", async () => {
    const a = await world("I2a");
    const b = await world("I2b");
    await newItem(a.manager.token, { sku: "FLOUR" }).expect(201);
    const dup = await newItem(a.manager.token, { sku: "flour" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("SKU_TAKEN");
    await newItem(b.manager.token, { sku: "FLOUR" }).expect(201);
  });

  it("rejects bad input and unknown suppliers", async () => {
    const w = await world("I3");
    expect((await newItem(w.manager.token, { quantity: -1 })).status).toBe(400);
    expect((await newItem(w.manager.token, { sku: "bad sku!" })).status).toBe(400);
    expect(
      (await newItem(w.manager.token, { supplierId: "00000000-0000-4000-8000-000000000000" }))
        .status,
    ).toBe(400);
  });

  it("archives items without losing their history", async () => {
    const w = await world("I4");
    const item = (await newItem(w.manager.token, { sku: "gone" })).body.data;
    await api("delete", `/inventory/items/${item.id}`, w.manager.token).expect(200);
    expect((await api("get", "/inventory/items", w.manager.token)).body.data).toHaveLength(0);
    const rows = await prisma.stockTransaction.count({ where: { itemId: item.id } });
    expect(rows).toBe(1);
    // The archived row still holds its SKU, so history stays unambiguous.
    expect((await newItem(w.manager.token, { sku: "gone" })).status).toBe(409);
  });
});

describe("stock movements", () => {
  it("applies each movement with the right sign and keeps a running balance", async () => {
    const w = await world("M1");
    const item = (await newItem(w.manager.token, { sku: "beef", quantity: 20, cost: 100 })).body
      .data;
    const move = (body: object) =>
      api("post", `/inventory/items/${item.id}/movements`, w.manager.token).send(body);

    expect(
      (await move({ type: "PURCHASE", quantity: 10, unitCost: 120, reference: "PO-1" })).body.data,
    ).toMatchObject({
      quantity: 30,
      cost: 120, // latest purchase price
    });
    expect((await move({ type: "USE", quantity: 4 })).body.data.quantity).toBe(26);
    expect((await move({ type: "WASTE", quantity: 1.5, note: "Dropped" })).body.data.quantity).toBe(
      24.5,
    );
    expect((await move({ type: "RETURN", quantity: 0.5 })).body.data.quantity).toBe(24);
    // A stock count states what is on the shelf; the system works out the difference.
    expect((await move({ type: "ADJUSTMENT", countedQuantity: 22 })).body.data.quantity).toBe(22);

    const rows = (await api("get", `/inventory/transactions?itemId=${item.id}`, w.manager.token))
      .body.data;
    expect(rows.map((r: { type: string }) => r.type).reverse()).toEqual([
      "PURCHASE", // opening
      "PURCHASE",
      "USE",
      "WASTE",
      "RETURN",
      "ADJUSTMENT",
    ]);
    expect(rows[0]).toMatchObject({
      quantityChange: -2,
      quantityAfter: 22,
      userName: "Test MANAGER",
    });
  });

  it("never lets stock go negative", async () => {
    const w = await world("M2");
    const item = (await newItem(w.manager.token, { sku: "salt", quantity: 3 })).body.data;
    const res = await api("post", `/inventory/items/${item.id}/movements`, w.manager.token).send({
      type: "USE",
      quantity: 3.001,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    const still = (await api("get", "/inventory/items", w.manager.token)).body.data[0];
    expect(still.quantity).toBe(3);
  });

  it("serialises simultaneous use so the last unit is only taken once", async () => {
    const w = await world("M3");
    const item = (await newItem(w.manager.token, { sku: "eggs", quantity: 10, unit: "pcs" })).body
      .data;
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api("post", `/inventory/items/${item.id}/movements`, w.manager.token).send({
          type: "USE",
          quantity: 4,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const stored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(stored.quantity)).toBe(2);
    // The audit trail adds up to the quantity on hand.
    const sum = await prisma.stockTransaction.aggregate({
      where: { itemId: item.id },
      _sum: { quantityChange: true },
    });
    expect(Number(sum._sum.quantityChange)).toBe(2);
  });

  it("transfers between branches for an owner, recording both sides", async () => {
    const a = await world("T1a");
    const b = await world("T1b");
    const owner = await actor("OWNER");
    const item = (
      await newItem(owner.token, { branchId: a.branch.id, sku: "TOMATO", quantity: 20 })
    ).body.data;

    const res = await api("post", `/inventory/items/${item.id}/movements`, owner.token).send({
      type: "TRANSFER",
      quantity: 8,
      toBranchId: b.branch.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.quantity).toBe(12);

    const dest = (await api("get", `/inventory/items?branchId=${b.branch.id}`, owner.token)).body
      .data;
    expect(dest).toHaveLength(1);
    expect(dest[0]).toMatchObject({ sku: "TOMATO", quantity: 8 });

    const out = await prisma.stockTransaction.findFirstOrThrow({
      where: { itemId: item.id, type: "TRANSFER" },
    });
    const inbound = await prisma.stockTransaction.findFirstOrThrow({
      where: { itemId: dest[0].id, type: "TRANSFER" },
    });
    expect(Number(out.quantityChange)).toBe(-8);
    expect(Number(inbound.quantityChange)).toBe(8);
    expect(out.counterpartId).toBe(inbound.id);
    expect(inbound.counterpartId).toBe(out.id);

    const tooMuch = await api("post", `/inventory/items/${item.id}/movements`, owner.token).send({
      type: "TRANSFER",
      quantity: 99,
      toBranchId: b.branch.id,
    });
    expect(tooMuch.body.error.code).toBe("INSUFFICIENT_STOCK");
    const same = await api("post", `/inventory/items/${item.id}/movements`, owner.token).send({
      type: "TRANSFER",
      quantity: 1,
      toBranchId: a.branch.id,
    });
    expect(same.status).toBe(400);
  });

  it("does not let a branch manager move stock into another branch", async () => {
    const a = await world("T2a");
    const b = await world("T2b");
    const item = (await newItem(a.manager.token, { sku: "RICE", quantity: 20 })).body.data;
    const res = await api("post", `/inventory/items/${item.id}/movements`, a.manager.token).send({
      type: "TRANSFER",
      quantity: 5,
      toBranchId: b.branch.id,
    });
    expect(res.status).toBe(403);
    expect((await api("get", "/inventory/items", a.manager.token)).body.data[0].quantity).toBe(20);
  });
});

describe("suppliers & access control", () => {
  it("manages suppliers and archives them, detaching their items", async () => {
    const w = await world("S1");
    const created = await api("post", "/suppliers", w.manager.token).send({
      name: "IT Fresh Farms",
      contactPerson: "Nimal",
      email: "orders@fresh.test",
      products: ["vegetables", "herbs"],
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data).toMatchObject({
      status: "ACTIVE",
      itemCount: 0,
      products: ["vegetables", "herbs"],
    });

    const item = (await newItem(w.manager.token, { sku: "BASIL", supplierId: id })).body.data;
    expect(item.supplierName).toBe("IT Fresh Farms");

    const updated = await api("patch", `/suppliers/${id}`, w.manager.token).send({
      status: "INACTIVE",
    });
    expect(updated.body.data).toMatchObject({ status: "INACTIVE", itemCount: 1 });

    await api("delete", `/suppliers/${id}`, w.manager.token).expect(200);
    expect(
      (await api("get", "/suppliers", w.manager.token)).body.data.find(
        (s: { id: string }) => s.id === id,
      ),
    ).toBeUndefined();
    expect(
      (await api("get", "/inventory/items", w.manager.token)).body.data[0].supplierId,
    ).toBeNull();
    expect((await api("post", "/suppliers", w.manager.token).send({ name: "" })).status).toBe(400);
  });

  it("is closed to floor staff, other branches and anonymous callers", async () => {
    const a = await world("A1");
    const b = await world("A1b");
    const item = (await newItem(a.manager.token, { sku: "X1" })).body.data;
    for (const role of ["WAITER", "KITCHEN", "CASHIER"] as const) {
      const user = await actor(role, a.branch.id);
      expect((await api("get", "/inventory/items", user.token)).status).toBe(403);
      expect((await api("get", "/suppliers", user.token)).status).toBe(403);
      expect(
        (
          await api("post", `/inventory/items/${item.id}/movements`, user.token).send({
            type: "USE",
            quantity: 1,
          })
        ).status,
      ).toBe(403);
    }
    expect((await api("get", "/inventory/items")).status).toBe(401);

    // Another branch's manager can neither read nor touch the item.
    expect(
      (await api("get", `/inventory/items?branchId=${a.branch.id}`, b.manager.token)).status,
    ).toBe(403);
    expect(
      (await api("patch", `/inventory/items/${item.id}`, b.manager.token).send({ name: "Hacked" }))
        .status,
    ).toBe(403);
    expect(
      (
        await api("post", `/inventory/items/${item.id}/movements`, b.manager.token).send({
          type: "USE",
          quantity: 1,
        })
      ).status,
    ).toBe(403);
  });
});
