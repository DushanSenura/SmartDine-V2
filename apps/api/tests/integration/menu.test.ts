import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actor,
  app,
  bearer,
  cleanupBranches,
  cleanupMenu,
  cleanupUsers,
  createBranch,
  prisma,
  request,
  setupDatabase,
} from "./helpers";

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
});
afterAll(async () => {
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});

const api = (method: "get" | "post" | "patch" | "delete", path: string, token?: string) => {
  const req = request(app)[method](`/api/v2${path}`);
  return token ? req.set(bearer(token)) : req;
};

async function setup(label: string) {
  const branch = await createBranch(label);
  const manager = await actor("MANAGER", branch.id);
  const category = await api("post", "/categories", manager.token).send({
    name: `IT Mains ${label}`,
  });
  return { branch, manager, category: category.body.data as { id: string; slug: string } };
}

const dish = (branchId: string, categoryId: string, extra = {}) => ({
  branchId,
  categoryId,
  name: "Spicy Prawn Curry",
  price: 4200,
  costPrice: 1500,
  ...extra,
});

describe("menu management", () => {
  it("creates items with unique slugs and keeps cost data staff-only", async () => {
    const { branch, manager, category } = await setup("M1");
    const first = await api("post", "/menu/items", manager.token).send(
      dish(branch.id, category.id, { vegan: true, spiceLevel: 2, comparePrice: 5000 }),
    );
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      slug: "spicy-prawn-curry",
      vegan: true,
      vegetarian: true, // vegan implies vegetarian
      discountPercent: 16,
      costPrice: 1500,
    });
    const second = await api("post", "/menu/items", manager.token).send(
      dish(branch.id, category.id),
    );
    expect(second.body.data.slug).toBe("spicy-prawn-curry-2");

    // The public view never exposes cost.
    const publicMenu = await api("get", `/menu?branchId=${branch.id}`);
    expect(publicMenu.status).toBe(200);
    expect(publicMenu.body.data.items).toHaveLength(2);
    expect(JSON.stringify(publicMenu.body)).not.toContain("costPrice");
  });

  it("filters the public menu", async () => {
    const { branch, manager, category } = await setup("M2");
    const make = (name: string, extra = {}) =>
      api("post", "/menu/items", manager.token).send(
        dish(branch.id, category.id, { name, ...extra }),
      );
    await make("Garden Salad", { vegan: true });
    await make("Beef Burger", { halal: true, popular: true });
    await make("Chilli Crab", { spiceLevel: 3, featured: true, tags: ["seafood"] });

    const names = async (qs: string) =>
      (await api("get", `/menu?branchId=${branch.id}&${qs}`)).body.data.items.map(
        (i: { name: string }) => i.name,
      );
    expect(await names("vegan=true")).toEqual(["Garden Salad"]);
    expect(await names("halal=true")).toEqual(["Beef Burger"]);
    expect(await names("spicy=true")).toEqual(["Chilli Crab"]);
    expect(await names("featured=true")).toEqual(["Chilli Crab"]);
    expect(await names("q=burg")).toEqual(["Beef Burger"]);
    expect(await names("q=seafood")).toEqual(["Chilli Crab"]); // tags are searchable
    expect(await names(`category=${category.slug}`)).toHaveLength(3);
    expect(await names("category=nonexistent")).toEqual([]);

    await api("get", "/menu").expect(400); // branchId is required
  });

  it("lets the kitchen flip availability instantly but not edit the menu", async () => {
    const { branch, manager, category } = await setup("M3");
    const created = await api("post", "/menu/items", manager.token).send(
      dish(branch.id, category.id),
    );
    const id = created.body.data.id as string;
    const kitchen = await actor("KITCHEN", branch.id);

    await api("patch", `/menu/items/${id}`, kitchen.token).send({ price: 1 }).expect(403);
    await api("post", "/menu/items", kitchen.token).send(dish(branch.id, category.id)).expect(403);
    await api("delete", `/menu/items/${id}`, kitchen.token).expect(403);

    const sold = await api("patch", `/menu/items/${id}/availability`, kitchen.token).send({
      availability: "SOLD_OUT",
    });
    expect(sold.status).toBe(200);
    expect(sold.body.data).toMatchObject({ availability: "SOLD_OUT", isAvailableNow: false });
    expect(sold.body.data.costPrice).toBeUndefined();

    // Customers see it immediately, flagged as unavailable.
    const view = await api("get", `/menu/items/${created.body.data.slug}?branchId=${branch.id}`);
    expect(view.body.data.item).toMatchObject({ availability: "SOLD_OUT", isAvailableNow: false });

    // The kitchen's admin list has no cost data.
    const list = await api("get", "/menu/admin", kitchen.token);
    expect(list.status).toBe(200);
    expect(list.body.data[0].costPrice).toBeUndefined();
    const managerList = await api("get", "/menu/admin", manager.token);
    expect(managerList.body.data[0].costPrice).toBe(1500);

    // Other branches' kitchens cannot touch it.
    const other = await actor("KITCHEN", (await createBranch("M3b")).id);
    await api("patch", `/menu/items/${id}/availability`, other.token)
      .send({ availability: "AVAILABLE" })
      .expect(403);
    // Waiters and customers cannot change availability at all.
    for (const role of ["WAITER", "CASHIER", "CUSTOMER"] as const) {
      const a = await actor(role, role === "CUSTOMER" ? undefined : branch.id);
      await api("patch", `/menu/items/${id}/availability`, a.token)
        .send({ availability: "AVAILABLE" })
        .expect(403);
    }
  });

  it("respects meal periods and hides deleted items", async () => {
    const { branch, manager, category } = await setup("M4");
    const breakfast = await api("post", "/menu/items", manager.token).send(
      dish(branch.id, category.id, { name: "Pancakes", mealPeriods: ["BREAKFAST"] }),
    );
    const allDay = await api("post", "/menu/items", manager.token).send(
      dish(branch.id, category.id, { name: "Fries" }),
    );
    const menu = (await api("get", `/menu?branchId=${branch.id}`)).body.data.items as {
      name: string;
      isAvailableNow: boolean;
    }[];
    expect(menu.find((i) => i.name === "Fries")?.isAvailableNow).toBe(true);
    // Whether breakfast is current depends on the clock; it must at least be consistent.
    expect(typeof menu.find((i) => i.name === "Pancakes")?.isAvailableNow).toBe("boolean");

    await api("delete", `/menu/items/${allDay.body.data.id}`, manager.token).expect(200);
    await api("delete", `/menu/items/${breakfast.body.data.id}`, manager.token).expect(200);
    expect((await api("get", `/menu?branchId=${branch.id}`)).body.data.items).toHaveLength(0);
    await api("get", `/menu/items/fries?branchId=${branch.id}`).expect(404);
  });

  it("isolates menu management by branch", async () => {
    const a = await setup("M5");
    const otherManager = await actor("MANAGER", (await createBranch("M5b")).id);
    const created = await api("post", "/menu/items", a.manager.token).send(
      dish(a.branch.id, a.category.id),
    );

    await api("post", "/menu/items", otherManager.token)
      .send(dish(a.branch.id, a.category.id))
      .expect(403);
    await api("patch", `/menu/items/${created.body.data.id}`, otherManager.token)
      .send({ price: 1 })
      .expect(403);
    await api("get", `/menu/admin?branchId=${a.branch.id}`, otherManager.token).expect(403);
  });

  it("validates input", async () => {
    const { branch, manager, category } = await setup("M6");
    await api("post", "/menu/items", manager.token)
      .send(dish(branch.id, category.id, { price: -5 }))
      .expect(400);
    await api("post", "/menu/items", manager.token)
      .send(dish(branch.id, category.id, { spiceLevel: 9 }))
      .expect(400);
    await api("post", "/menu/items", manager.token)
      .send(dish(branch.id, category.id, { image: "javascript:alert(1)" }))
      .expect(400);
    await api("post", "/menu/items", manager.token)
      .send(dish(branch.id, "00000000-0000-4000-8000-000000000000"))
      .expect(400);
  });
});

describe("categories", () => {
  it("is managed by menu managers only and protects non-empty categories", async () => {
    const { branch, manager, category } = await setup("C1");
    const waiter = await actor("WAITER", branch.id);
    await api("post", "/categories", waiter.token).send({ name: "IT Nope" }).expect(403);
    await api("post", "/categories", undefined).send({ name: "IT Nope" }).expect(401);

    const renamed = await api("patch", `/categories/${category.id}`, manager.token).send({
      description: "Hearty plates",
    });
    expect(renamed.body.data.description).toBe("Hearty plates");

    await api("post", "/menu/items", manager.token).send(dish(branch.id, category.id));
    const blocked = await api("delete", `/categories/${category.id}`, manager.token);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CATEGORY_NOT_EMPTY");

    const publicList = await api("get", "/categories");
    expect(publicList.body.data.some((c: { id: string }) => c.id === category.id)).toBe(true);
    await api("patch", `/categories/${category.id}`, manager.token).send({ isActive: false });
    const after = await api("get", "/categories");
    expect(after.body.data.some((c: { id: string }) => c.id === category.id)).toBe(false);
  });
});
