import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSocketServer } from "../../src/sockets";
import { emitToBranch, registerSocketServer } from "../../src/sockets/emitter";
import {
  actor,
  cleanupBranches,
  cleanupUsers,
  createBranch,
  prisma,
  setupDatabase,
} from "./helpers";

let server: HttpServer;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  await setupDatabase();
  server = createServer();
  registerSocketServer(createSocketServer(server));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanupUsers();
  await cleanupBranches();
  await prisma.$disconnect();
});

function open(token?: string): Promise<Socket> {
  const socket = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

/** Resolves true if `event` arrives within `ms`, else false. */
const received = (socket: Socket, event: string, ms = 400) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

describe("socket authentication and branch rooms", () => {
  it("rejects connections without a valid token", async () => {
    await expect(open(undefined)).rejects.toThrow("UNAUTHENTICATED");
    await expect(open("garbage")).rejects.toThrow("UNAUTHENTICATED");
  });

  it("delivers branch events to that branch's staff only", async () => {
    const [a, b] = [await createBranch("K1"), await createBranch("K2")];
    const waiterA = await open((await actor("WAITER", a.id)).token);
    const waiterB = await open((await actor("WAITER", b.id)).token);

    const gotA = received(waiterA, "ping");
    const gotB = received(waiterB, "ping");
    await new Promise((r) => setTimeout(r, 100)); // let the connection handlers join their rooms
    emitToBranch(a.id, "ping", {});
    expect(await gotA).toBe(true);
    expect(await gotB).toBe(false);
  });

  it("ignores attempts to subscribe to a branch the user cannot access", async () => {
    const [a, b] = [await createBranch("K3"), await createBranch("K4")];
    const waiterA = await open((await actor("WAITER", a.id)).token);
    waiterA.emit("branch:join", b.id);
    await new Promise((r) => setTimeout(r, 150));

    const got = received(waiterA, "secret");
    emitToBranch(b.id, "secret", {});
    expect(await got).toBe(false);
  });

  it("lets an owner subscribe to any branch and release it again", async () => {
    const branch = await createBranch("K5");
    const owner = await open((await actor("OWNER")).token);
    owner.emit("branch:join", branch.id);
    await new Promise((r) => setTimeout(r, 150));

    const first = received(owner, "tick");
    emitToBranch(branch.id, "tick", {});
    expect(await first).toBe(true);

    owner.emit("branch:leave", branch.id);
    await new Promise((r) => setTimeout(r, 150));
    const second = received(owner, "tick");
    emitToBranch(branch.id, "tick", {});
    expect(await second).toBe(false);
  });

  it("ignores malformed join requests", async () => {
    const owner = await open((await actor("OWNER")).token);
    owner.emit("branch:join", { not: "a string" });
    owner.emit("branch:join", "not-a-uuid");
    await new Promise((r) => setTimeout(r, 100));
    expect(owner.connected).toBe(true);
  });
});
