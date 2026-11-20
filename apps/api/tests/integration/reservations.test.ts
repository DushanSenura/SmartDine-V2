import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ALL_DAYS_OPEN,
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
  await cleanupUsers();
  await cleanupBranches();
  await prisma.$disconnect();
});

const api = (method: "get" | "post" | "patch", path: string, token?: string) => {
  const req = request(app)[method](`/api/v2${path}`);
  return token ? req.set(bearer(token)) : req;
};

const TZ = "Asia/Colombo";

/** A branch open 10:00–22:00 every day with one area and tables of the given capacities. */
async function venue(label: string, capacities: number[], extra = {}) {
  const branch = await createBranch(label, { openingHours: ALL_DAYS_OPEN, timezone: TZ, ...extra });
  const area = await prisma.diningArea.create({ data: { branchId: branch.id, name: "Hall" } });
  const tables = [];
  for (const [i, capacity] of capacities.entries()) {
    tables.push(
      await prisma.restaurantTable.create({
        data: { branchId: branch.id, diningAreaId: area.id, tableNumber: String(i + 1), capacity },
      }),
    );
  }
  return { branch, area, tables };
}

const booking = (branchId: string, extra: Record<string, unknown> = {}) => ({
  branchId,
  date: futureDate(10),
  time: "19:00",
  partySize: 2,
  guestName: "Ada Lovelace",
  guestEmail: "ada@example.com",
  guestPhone: "+94 77 123 4567",
  ...extra,
});

describe("availability (public)", () => {
  it("lists slots with the free areas, without logging in", async () => {
    const { branch } = await venue("R1", [2, 4]);
    const res = await api(
      "get",
      `/reservations/availability?branchId=${branch.id}&date=${futureDate(10)}&guests=3`,
    );
    expect(res.status).toBe(200);
    const { slots, durationMinutes, closed } = res.body.data;
    expect(closed).toBe(false);
    expect(durationMinutes).toBe(90);
    expect(slots[0].time).toBe("10:00");
    expect(slots.at(-1).time).toBe("20:30"); // 20:30 + 90 min = closing at 22:00
    const seven = slots.find((s: { time: string }) => s.time === "19:00");
    expect(seven).toMatchObject({ available: true, areas: [{ name: "Hall", tables: 1 }] }); // only the 4-top fits 3
  });

  it("offers nothing when no table is big enough, and reports closed days", async () => {
    const { branch } = await venue("R2", [2]);
    const big = await api(
      "get",
      `/reservations/availability?branchId=${branch.id}&date=${futureDate(10)}&guests=6`,
    );
    expect(big.body.data.slots.every((s: { available: boolean }) => !s.available)).toBe(true);

    const closedBranch = await createBranch("R2c", {
      timezone: TZ,
      openingHours: {
        ...ALL_DAYS_OPEN,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
        mon: null,
      },
    });
    const closed = await api(
      "get",
      `/reservations/availability?branchId=${closedBranch.id}&date=${futureDate(10)}&guests=2`,
    );
    expect(closed.body.data).toMatchObject({ closed: true, slots: [] });
  });

  it("validates its query", async () => {
    await api("get", "/reservations/availability?date=2026-01-01&guests=2").expect(400);
    const { branch } = await venue("R2d", [2]);
    await api(
      "get",
      `/reservations/availability?branchId=${branch.id}&date=tomorrow&guests=2`,
    ).expect(400);
    await api(
      "get",
      `/reservations/availability?branchId=${branch.id}&date=${futureDate(5)}&guests=0`,
    ).expect(400);
  });
});

describe("table reservations", () => {
  it("books the best-fitting table and shows it in the customer's list", async () => {
    const { branch, tables } = await venue("R3", [6, 2, 4]);
    const customer = await actor("CUSTOMER");

    const res = await api("post", "/reservations", customer.token).send(
      booking(branch.id, { partySize: 3 }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: "CONFIRMED",
      type: "TABLE",
      partySize: 3,
      areaName: "Hall",
      tableNumber: "3", // the 4-seater: smallest table that fits
      canCancel: true,
    });
    expect(res.body.data.reference).toMatch(/^SD-[A-Z2-9]{6}$/);
    expect(res.body.data.tableId).toBe(tables[2]!.id);
    // 19:00 Colombo is 13:30 UTC; the booking is 90 minutes long.
    expect(res.body.data.startsAt).toBe(`${futureDate(10)}T13:30:00.000Z`);
    expect(res.body.data.endsAt).toBe(`${futureDate(10)}T15:00:00.000Z`);

    const mine = await api("get", "/reservations/mine", customer.token);
    expect(mine.body.data).toHaveLength(1);
    const other = await actor("CUSTOMER");
    expect((await api("get", "/reservations/mine", other.token)).body.data).toHaveLength(0);
  });

  it("requires a customer account", async () => {
    const { branch } = await venue("R4", [4]);
    await api("post", "/reservations").send(booking(branch.id)).expect(401);
    const waiter = await actor("WAITER", branch.id);
    await api("post", "/reservations", waiter.token).send(booking(branch.id)).expect(403);
  });

  it("prevents double booking, including partial overlaps, but allows back-to-back bookings", async () => {
    const { branch } = await venue("R5", [4]);
    const customer = await actor("CUSTOMER");
    const book = (time: string) =>
      api("post", "/reservations", customer.token).send(booking(branch.id, { time }));

    expect((await book("19:00")).status).toBe(201);
    for (const clash of ["19:00", "19:30", "18:00"]) {
      const res = await book(clash);
      expect(res.status, clash).toBe(409);
      expect(res.body.error.code).toBe("RESERVATION_CONFLICT");
    }
    expect((await book("17:30")).status).toBe(201); // ends exactly at 19:00
    expect((await book("20:30")).status).toBe(201); // starts exactly when the 19:00 booking ends
  });

  it("lets exactly one of many simultaneous requests win the last table", async () => {
    const { branch } = await venue("R6", [4]);
    const customers = await Promise.all(Array.from({ length: 6 }, () => actor("CUSTOMER")));
    const results = await Promise.all(
      customers.map((c) =>
        api("post", "/reservations", c.token).send(booking(branch.id, { time: "20:00" })),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
    const rows = await prisma.restaurantReservation.count({ where: { branchId: branch.id } });
    expect(rows).toBe(1);
  });

  it("spreads concurrent requests across all available tables", async () => {
    const { branch } = await venue("R7", [2, 2, 2]);
    const customers = await Promise.all(Array.from({ length: 5 }, () => actor("CUSTOMER")));
    const results = await Promise.all(
      customers.map((c) => api("post", "/reservations", c.token).send(booking(branch.id))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const tableIds = results.filter((r) => r.status === 201).map((r) => r.body.data.tableId);
    expect(new Set(tableIds).size).toBe(3);
  });

  it("frees the table when a booking is cancelled", async () => {
    const { branch } = await venue("R8", [4]);
    const a = await actor("CUSTOMER");
    const b = await actor("CUSTOMER");
    const first = await api("post", "/reservations", a.token).send(booking(branch.id));
    await api("post", "/reservations", b.token).send(booking(branch.id)).expect(409);

    const cancelled = await api("post", `/reservations/${first.body.data.id}/cancel`, a.token);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");
    await api("post", "/reservations", b.token).send(booking(branch.id)).expect(201);
    // Cancelling twice is refused.
    await api("post", `/reservations/${first.body.data.id}/cancel`, a.token).expect(409);
  });

  it("only lets the owner cancel, and only before the cancellation window closes", async () => {
    const { branch } = await venue("R9", [4, 4]);
    const owner = await actor("CUSTOMER");
    const stranger = await actor("CUSTOMER");
    const res = await api("post", "/reservations", owner.token).send(booking(branch.id));
    const id = res.body.data.id;

    // Someone else's reservation looks like it does not exist.
    await api("post", `/reservations/${id}/cancel`, stranger.token).expect(404);

    const settings = await prisma.companySettings.findFirstOrThrow();
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { cancellationWindowHours: 24 * 30 },
    });
    try {
      const late = await api("post", `/reservations/${id}/cancel`, owner.token);
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe("CANCELLATION_WINDOW_PASSED");
      const view = await api("get", "/reservations/mine", owner.token);
      expect(view.body.data[0].canCancel).toBe(false);
    } finally {
      await prisma.companySettings.update({
        where: { id: settings.id },
        data: { cancellationWindowHours: settings.cancellationWindowHours },
      });
    }
  });

  it("rejects invalid times, closed days and closed branches", async () => {
    const { branch } = await venue("R10", [4]);
    const customer = await actor("CUSTOMER");
    const post = (extra: Record<string, unknown>) =>
      api("post", "/reservations", customer.token).send(booking(branch.id, extra));

    expect((await post({ time: "19:15" })).status).toBe(400); // not on a 30-minute slot
    expect((await post({ time: "09:00" })).status).toBe(400); // before opening
    expect((await post({ time: "21:30" })).status).toBe(400); // would end after closing
    expect((await post({ date: futureDate(-1) })).status).toBe(400); // in the past
    expect((await post({ date: futureDate(200) })).status).toBe(400); // too far ahead
    expect((await post({ partySize: 0 })).status).toBe(400);
    expect((await post({ partySize: 99 })).status).toBe(400);
    expect((await post({ guestEmail: "nope" })).status).toBe(400);
    expect((await post({ partySize: 9 })).status).toBe(409); // no table fits

    const closedBranch = await createBranch("R10c", { timezone: TZ, status: "CLOSED" });
    const closed = await api("post", "/reservations", customer.token).send(
      booking(closedBranch.id),
    );
    expect(closed.body.error.code).toBe("BRANCH_NOT_OPEN");

    const dayOff = await createBranch("R10d", {
      timezone: TZ,
      openingHours: Object.fromEntries(Object.keys(ALL_DAYS_OPEN).map((d) => [d, null])),
    });
    const noDay = await api("post", "/reservations", customer.token).send(booking(dayOff.id));
    expect(noDay.body.error.code).toBe("BRANCH_CLOSED");
  });

  it("ignores out-of-service tables and inactive areas", async () => {
    const { branch, tables, area } = await venue("R11", [4, 4]);
    const customer = await actor("CUSTOMER");
    await prisma.restaurantTable.update({
      where: { id: tables[0]!.id },
      data: { status: "OUT_OF_SERVICE" },
    });
    const first = await api("post", "/reservations", customer.token).send(booking(branch.id));
    expect(first.body.data.tableId).toBe(tables[1]!.id);
    await prisma.diningArea.update({ where: { id: area.id }, data: { isActive: false } });
    const second = await api("post", "/reservations", customer.token).send(
      booking(branch.id, { time: "12:00" }),
    );
    expect(second.status).toBe(409);
  });

  it("honours the preferred dining area", async () => {
    const { branch, area } = await venue("R12", [4]);
    const terrace = await prisma.diningArea.create({
      data: { branchId: branch.id, name: "Terrace" },
    });
    await prisma.restaurantTable.create({
      data: { branchId: branch.id, diningAreaId: terrace.id, tableNumber: "T1", capacity: 4 },
    });
    const customer = await actor("CUSTOMER");
    const res = await api("post", "/reservations", customer.token).send(
      booking(branch.id, { diningAreaId: terrace.id }),
    );
    expect(res.body.data.areaName).toBe("Terrace");
    const other = await api("post", "/reservations", customer.token).send(
      booking(branch.id, { diningAreaId: area.id }),
    );
    expect(other.body.data.areaName).toBe("Hall");
    // Terrace is now taken for that time and the customer insists on it.
    const again = await actor("CUSTOMER");
    await api("post", "/reservations", again.token)
      .send(booking(branch.id, { diningAreaId: terrace.id }))
      .expect(409);
  });

  it("limits how many upcoming reservations one customer can hold", async () => {
    const { branch } = await venue("R13", [2, 2, 2, 2, 2, 2]);
    const customer = await actor("CUSTOMER");
    for (let i = 0; i < 5; i++) {
      await api("post", "/reservations", customer.token).send(booking(branch.id)).expect(201);
    }
    const sixth = await api("post", "/reservations", customer.token).send(booking(branch.id));
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("TOO_MANY_RESERVATIONS");
  });
});

describe("staff reservation workflow", () => {
  it("moves a booking through check-in, seating and completion, updating the table", async () => {
    const { branch, tables } = await venue("S1", [4]);
    const customer = await actor("CUSTOMER");
    const waiter = await actor("WAITER", branch.id);
    const created = await api("post", "/reservations", customer.token).send(booking(branch.id));
    const id = created.body.data.id;
    const status = (next: string) =>
      api("patch", `/reservations/${id}/status`, waiter.token).send({ status: next });

    await status("SEATED").expect(409); // cannot skip check-in
    expect((await status("CHECKED_IN")).body.data.status).toBe("CHECKED_IN");
    expect((await status("SEATED")).body.data.status).toBe("SEATED");
    expect(
      (await prisma.restaurantTable.findUniqueOrThrow({ where: { id: tables[0]!.id } })).status,
    ).toBe("OCCUPIED");

    const done = await status("COMPLETED");
    expect(done.body.data.status).toBe("COMPLETED");
    await status("CANCELLED").expect(409); // terminal
    await api("patch", `/reservations/${id}/status`, waiter.token)
      .send({ status: "BOGUS" })
      .expect(400);
  });

  it("lets staff list a day's bookings but only for their own branch", async () => {
    const [a, b] = [await venue("S2", [4]), await venue("S3", [4])];
    const customer = await actor("CUSTOMER");
    const manager = await actor("MANAGER", a.branch.id);
    const created = await api("post", "/reservations", customer.token).send(booking(a.branch.id));

    const day = futureDate(10);
    const list = await api("get", `/reservations?date=${day}`, manager.token);
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toEqual([created.body.data.id]);
    expect(
      (await api("get", `/reservations?date=${futureDate(11)}`, manager.token)).body.data,
    ).toEqual([]);

    await api("get", `/reservations?branchId=${b.branch.id}&date=${day}`, manager.token).expect(
      403,
    );
    await api(
      "patch",
      `/reservations/${created.body.data.id}/status`,
      (await actor("MANAGER", b.branch.id)).token,
    )
      .send({ status: "CANCELLED" })
      .expect(403);
    await api("get", "/reservations", customer.token).expect(403);
    await api("get", "/reservations", (await actor("KITCHEN", a.branch.id)).token).expect(403);
  });

  it("lets staff book by phone, optionally on a specific table, with the same conflict rules", async () => {
    const { branch, tables } = await venue("S4", [4, 4]);
    const manager = await actor("MANAGER", branch.id);
    const phone = (extra = {}) =>
      api("post", "/reservations/staff", manager.token).send(booking(branch.id, extra));

    const pinned = await phone({ tableId: tables[1]!.id });
    expect(pinned.status).toBe(201);
    expect(pinned.body.data.tableId).toBe(tables[1]!.id);
    expect((await phone({ tableId: tables[1]!.id })).status).toBe(409); // that table is taken
    expect((await phone()).body.data.tableId).toBe(tables[0]!.id); // otherwise the free one
    expect((await phone()).status).toBe(409); // full
  });
});

describe("private dining reservations", () => {
  async function room(label: string, extra = {}) {
    const { branch } = await venue(label, [2]);
    const room = await prisma.privateDiningRoom.create({
      data: {
        branchId: branch.id,
        name: "Garden Room",
        capacity: 20,
        minimumGuests: 6,
        maximumGuests: 16,
        hourlyRate: 6000,
        deposit: 15000,
        minimumSpend: 60000,
        ...extra,
      },
    });
    return { branch, room };
  }
  const privateBooking = (roomId: string, extra: Record<string, unknown> = {}) => ({
    roomId,
    date: futureDate(14),
    time: "18:00",
    durationMinutes: 180,
    partySize: 10,
    occasion: "BIRTHDAY",
    guestName: "Grace Hopper",
    guestEmail: "grace@example.com",
    guestPhone: "+94 71 987 6543",
    ...extra,
  });

  it("creates a pending booking with deposit and estimated cost", async () => {
    const { room: r } = await room("P1");
    const customer = await actor("CUSTOMER");
    const res = await api("post", "/reservations/private", customer.token).send(
      privateBooking(r.id),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: "PRIVATE_DINING",
      status: "PENDING",
      roomName: "Garden Room",
      occasion: "BIRTHDAY",
      depositAmount: 15000,
      estimatedCost: 18000, // 3 h × 6000
      tableId: null,
    });
  });

  it("enforces guest limits, opening times and duration rules", async () => {
    const { room: r } = await room("P2");
    const customer = await actor("CUSTOMER");
    const post = (extra: Record<string, unknown>) =>
      api("post", "/reservations/private", customer.token).send(privateBooking(r.id, extra));
    expect((await post({ partySize: 3 })).status).toBe(400); // below minimum
    expect((await post({ partySize: 40 })).status).toBe(400); // above maximum
    expect((await post({ time: "21:00" })).status).toBe(400); // runs past closing (22:00)
    expect((await post({ time: "08:00" })).status).toBe(400); // before opening
    expect((await post({ durationMinutes: 30 })).status).toBe(400); // too short
    expect((await post({ durationMinutes: 100 })).status).toBe(400); // not a 30-minute step
    expect((await post({ occasion: "WEDDING" })).status).toBe(400); // unknown occasion
    expect((await post({ date: futureDate(-2) })).status).toBe(400);

    await prisma.privateDiningRoom.update({ where: { id: r.id }, data: { isActive: false } });
    expect((await post({})).status).toBe(404);
  });

  it("prevents overlapping bookings of the same room and exposes busy times", async () => {
    const { room: r } = await room("P3");
    const a = await actor("CUSTOMER");
    const b = await actor("CUSTOMER");
    await api("post", "/reservations/private", a.token).send(privateBooking(r.id)).expect(201); // 18:00–21:00

    const clash = await api("post", "/reservations/private", b.token).send(
      privateBooking(r.id, { time: "20:00", durationMinutes: 90 }),
    );
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("RESERVATION_CONFLICT");
    await api("post", "/reservations/private", b.token)
      .send(privateBooking(r.id, { time: "12:00", durationMinutes: 360 })) // ends exactly 18:00
      .expect(201);

    const avail = await api(
      "get",
      `/reservations/private/availability?roomId=${r.id}&date=${futureDate(14)}`,
    );
    expect(avail.status).toBe(200);
    expect(avail.body.data).toMatchObject({ closed: false, opens: "10:00", closes: "22:00" });
    expect(avail.body.data.busy).toEqual([
      { start: "12:00", end: "18:00" },
      { start: "18:00", end: "21:00" },
    ]);
  });

  it("lets only one of several simultaneous requests book the room", async () => {
    const { room: r } = await room("P4");
    const customers = await Promise.all(Array.from({ length: 5 }, () => actor("CUSTOMER")));
    const results = await Promise.all(
      customers.map((c) =>
        api("post", "/reservations/private", c.token).send(privateBooking(r.id)),
      ),
    );
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect(results.filter((x) => x.status === 409)).toHaveLength(4);
  });

  it("uses the room's own opening times when set", async () => {
    const { room: r } = await room("P5", {
      openingTimes: Object.fromEntries(
        Object.keys(ALL_DAYS_OPEN).map((d) => [d, { open: "12:00", close: "16:00" }]),
      ),
    });
    const customer = await actor("CUSTOMER");
    const post = (extra: Record<string, unknown>) =>
      api("post", "/reservations/private", customer.token).send(privateBooking(r.id, extra));
    expect((await post({ time: "18:00" })).status).toBe(400);
    expect((await post({ time: "12:00", durationMinutes: 240 })).status).toBe(201);
  });

  it("lets a customer cancel a private booking but not other people's", async () => {
    const { room: r } = await room("P6");
    const owner = await actor("CUSTOMER");
    const res = await api("post", "/reservations/private", owner.token).send(privateBooking(r.id));
    await api(
      "post",
      `/reservations/${res.body.data.id}/cancel`,
      (await actor("CUSTOMER")).token,
    ).expect(404);
    const ok = await api("post", `/reservations/${res.body.data.id}/cancel`, owner.token);
    expect(ok.body.data.status).toBe("CANCELLED");
    await api("post", "/reservations/private", owner.token).send(privateBooking(r.id)).expect(201);
  });
});

describe("staff reservation list", () => {
  it("shows a future booking under 'upcoming' even though it is not today's", async () => {
    const { branch } = await venue("R9", [4]);
    const customer = await actor("CUSTOMER");
    const owner = await actor("OWNER");
    await api("post", "/reservations", customer.token).send(booking(branch.id)).expect(201);

    const upcoming = await api(
      "get",
      `/reservations?branchId=${branch.id}&upcoming=true`,
      owner.token,
    );
    expect(upcoming.body.data).toHaveLength(1);
    expect(upcoming.body.data[0].guestName).toBe("Ada Lovelace");

    const today = await api(
      "get",
      `/reservations?branchId=${branch.id}&date=${futureDate(0)}`,
      owner.token,
    );
    expect(today.body.data).toHaveLength(0);
  });
});
