import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { apiRouter } from "../../src/routes";
import { actor, app, bearer, cleanupUsers, prisma, request, setupDatabase } from "./helpers";

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: RouteLayer[] };
}

interface Endpoint {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
}

/**
 * Every endpoint, read from the live router. `routes.ts` mounts routers in the order it is written,
 * so zipping its `apiRouter.use("/x", …)` lines with the router stack recovers each mount path.
 */
function allEndpoints(): Endpoint[] {
  const source = readFileSync(join(__dirname, "../../src/routes.ts"), "utf8");
  const mounts = [...source.matchAll(/apiRouter\.use\("(\/[^"]+)"/g)].map((m) => m[1]!);
  const layers = (apiRouter as unknown as { stack: RouteLayer[] }).stack;
  expect(layers).toHaveLength(mounts.length);

  const endpoints: Endpoint[] = [];
  layers.forEach((layer, index) => {
    for (const inner of layer.handle.stack ?? []) {
      if (!inner.route) continue;
      for (const method of Object.keys(inner.route.methods)) {
        const sub = inner.route.path === "/" ? "" : inner.route.path;
        endpoints.push({ method: method as Endpoint["method"], path: `${mounts[index]}${sub}` });
      }
    }
  });
  return endpoints;
}

/** Routes that are public on purpose. Anything not listed here must demand a signed-in user. */
const PUBLIC = [
  /^\/health/,
  /^\/public\//,
  /^\/auth\/(login|register|refresh|logout)$/,
  /^get \/menu(\/|$)/,
  /^get \/reviews$/,
  // Customer-facing catalogue and availability reads (the public Menu, Rooms and booking pages).
  /^get \/(categories|room-types|room-extras)(\/|$)/,
  /^get \/(reservations|room-bookings)\/(private\/)?availability$/,
];

const isPublic = ({ method, path }: Endpoint) =>
  PUBLIC.some((pattern) => pattern.test(path) || pattern.test(`${method} ${path}`));

const GARBAGE = ["abc", "00000000-0000-0000-0000-000000000000", "%00", "1;DROP TABLE users"];

const fill = (path: string, value: string) => `/api/v2${path.replace(/:\w+/g, value)}`;

beforeAll(setupDatabase);
afterAll(async () => {
  await cleanupUsers();
  await prisma.$disconnect();
});

describe("route sweep", () => {
  const endpoints = allEndpoints();

  it("finds the whole API surface", () => {
    expect(endpoints.length).toBeGreaterThan(150);
  });

  it("rejects every non-public endpoint without credentials", async () => {
    const open: string[] = [];
    for (const endpoint of endpoints.filter((e) => !isPublic(e))) {
      const res = await request(app)[endpoint.method](fill(endpoint.path, "abc"));
      if (res.status !== 401)
        open.push(`${endpoint.method.toUpperCase()} ${endpoint.path} → ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it("never answers 5xx to an owner sending garbage ids or an empty body", async () => {
    const owner = await actor("OWNER");
    const failures: string[] = [];
    for (const endpoint of endpoints.filter((e) => !e.path.startsWith("/auth"))) {
      for (const value of GARBAGE) {
        const res = await request(app)
          [endpoint.method](fill(endpoint.path, value))
          .set(bearer(owner.token))
          .send(endpoint.method === "get" || endpoint.method === "delete" ? undefined : {});
        if (res.status >= 500) {
          failures.push(
            `${endpoint.method.toUpperCase()} ${endpoint.path} [${value}] → ${res.status}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("refuses a NUL byte in search", async () => {
    const owner = await actor("OWNER");
    await request(app).get("/api/v2/search?q=a%00b").set(bearer(owner.token)).expect(400);
  });
});
