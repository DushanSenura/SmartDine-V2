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
  await cleanupUsers();
  await cleanupBranches();
  await prisma.$disconnect();
});

const TZ = "Asia/Colombo";
const api = (method: "get" | "post" | "patch" | "delete", path: string, token?: string) => {
  const req = request(app)[method](`/api/v2${path}`);
  return token ? req.set(bearer(token)) : req;
};
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** A branch with a 2-room type (sleeps 2), a 1-room type (sleeps 4), and an extra. */
async function hotel(label: string) {
  const branch = await createBranch(label, { timezone: TZ });
  const standard = await prisma.roomType.create({
    data: {
      branchId: branch.id,
      name: "Standard",
      slug: "standard",
      maximumGuests: 2,
      bedType: "DOUBLE",
      basePrice: 10000,
      weekendPrice: 15000,
      amenities: ["Wi-Fi"],
    },
  });
  const family = await prisma.roomType.create({
    data: {
      branchId: branch.id,
      name: "Family",
      slug: "family",
      maximumGuests: 4,
      bedType: "KING",
      basePrice: 30000,
    },
  });
  const rooms = await Promise.all(
    [
      [standard.id, "101"],
      [standard.id, "102"],
      [family.id, "201"],
    ].map(([roomTypeId, roomNumber]) =>
      prisma.room.create({
        data: { branchId: branch.id, roomTypeId: roomTypeId!, roomNumber: roomNumber! },
      }),
    ),
  );
  const extra = await prisma.roomExtra.create({
    data: { branchId: branch.id, name: "Breakfast", price: 1000, pricingMode: "PER_GUEST" },
  });
  return { branch, standard, family, rooms, extra };
}

const stay = (extra: Record<string, unknown> = {}) => ({
  checkIn: futureDate(20),
  checkOut: futureDate(22),
  adults: 2,
  children: 0,
  ...extra,
});

const bookingBody = (
  h: Awaited<ReturnType<typeof hotel>>,
  extra: Record<string, unknown> = {},
) => ({
  branchId: h.branch.id,
  roomTypeId: h.standard.id,
  ...stay(),
  guestName: "Ada Lovelace",
  guestEmail: "ada@example.com",
  guestPhone: "+94 77 123 4567",
  ...extra,
});

const query = (branchId: string, s: Record<string, unknown>) =>
  new URLSearchParams({
    branchId,
    ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v)])),
  }).toString();

describe("public room types and availability", () => {
  it("lists only active room types that have rooms", async () => {
    const h = await hotel("A1");
    await prisma.roomType.create({
      data: {
        branchId: h.branch.id,
        name: "Empty",
        slug: "empty",
        maximumGuests: 2,
        bedType: "DOUBLE",
        basePrice: 1,
      },
    });
    await prisma.roomType.update({ where: { id: h.family.id }, data: { status: "INACTIVE" } });
    const res = await api("get", `/room-types?branchId=${h.branch.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { name: string }) => t.name)).toEqual(["Standard"]);
    await api("get", `/room-types/by-slug/standard?branchId=${h.branch.id}`).expect(200);
    await api("get", `/room-types/by-slug/family?branchId=${h.branch.id}`).expect(404);
  });

  it("quotes weekend nights, taxes and deposit", async () => {
    const h = await hotel("A2");
    // Find a Thursday-night start so the stay covers Thu, Fri, Sat (3 nights).
    let start = futureDate(20);
    while (new Date(`${start}T12:00:00Z`).getUTCDay() !== 4)
      start = new Date(Date.parse(`${start}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.parse(`${start}T12:00:00Z`) + 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const settings = await prisma.companySettings.findFirstOrThrow();
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { taxRatePercent: 10, roomDepositPercent: 20 },
    });
    try {
      const res = await api(
        "get",
        `/room-bookings/availability?${query(h.branch.id, { checkIn: start, checkOut: end, adults: 2 })}`,
      );
      expect(res.status).toBe(200);
      const standard = res.body.data.results.find(
        (r: { roomType: { name: string } }) => r.roomType.name === "Standard",
      );
      expect(standard.available).toBe(2);
      expect(standard.quote).toMatchObject({
        nights: 3,
        roomSubtotal: 10000 + 15000 + 15000, // Thu base, Fri + Sat weekend
        taxes: 4000,
        total: 44000,
        deposit: 8800,
      });
      expect(res.body.data).toMatchObject({ nights: 3, guests: 2, checkInTime: "14:00" });
    } finally {
      await prisma.companySettings.update({
        where: { id: settings.id },
        data: {
          taxRatePercent: settings.taxRatePercent,
          roomDepositPercent: settings.roomDepositPercent,
        },
      });
    }
  });

  it("filters by party size and excludes rooms that are out of service or booked", async () => {
    const h = await hotel("A3");
    const types = async (s: Record<string, unknown>) =>
      (
        await api("get", `/room-bookings/availability?${query(h.branch.id, stay(s))}`)
      ).body.data.results.map(
        (r: { roomType: { name: string }; available: number }) =>
          `${r.roomType.name}:${r.available}`,
      );
    expect(await types({})).toEqual(["Standard:2", "Family:1"]);
    expect(await types({ adults: 3 })).toEqual(["Family:1"]); // Standard sleeps 2
    expect(await types({ adults: 2, children: 3 })).toEqual([]); // 5 > any capacity

    await prisma.room.update({ where: { id: h.rooms[0]!.id }, data: { status: "MAINTENANCE" } });
    expect(await types({})).toEqual(["Standard:1", "Family:1"]);
  });

  it("rejects invalid stays", async () => {
    const h = await hotel("A4");
    const avail = (s: Record<string, unknown>) =>
      api("get", `/room-bookings/availability?${query(h.branch.id, stay(s))}`);
    expect((await avail({ checkIn: futureDate(-3), checkOut: futureDate(-1) })).status).toBe(400);
    expect((await avail({ checkOut: futureDate(20) })).status).toBe(400); // zero nights
    expect((await avail({ checkOut: futureDate(15) })).status).toBe(400); // before check-in
    expect((await avail({ checkOut: futureDate(60) })).status).toBe(400); // > 30 nights
    expect((await avail({ checkIn: futureDate(500), checkOut: futureDate(502) })).status).toBe(400);
    expect((await avail({ adults: 0 })).status).toBe(400);
    expect((await avail({ checkIn: "soon" })).status).toBe(400);
  });
});

describe("booking a room", () => {
  it("books the lowest-numbered free room and prices everything server-side", async () => {
    const h = await hotel("B1");
    const customer = await actor("CUSTOMER");
    const res = await api("post", "/room-bookings", customer.token).send(
      bookingBody(h, {
        extras: [{ extraId: h.extra.id, quantity: 1 }],
        additionalGuests: [{ name: "Charles Babbage", isChild: false }],
        specialRequests: "Quiet room",
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      roomNumber: "101",
      nights: 2,
    });
    expect(res.body.data.reference).toMatch(/^RM-[A-Z2-9]{6}$/);
    expect(res.body.data.extras).toEqual([{ name: "Breakfast", quantity: 1, total: 2000 }]); // per guest × 2
    expect(res.body.data.additionalGuests).toHaveLength(1);
    expect(res.body.data.total).toBe(res.body.data.roomSubtotal + 2000 + res.body.data.taxes);

    const mine = await api("get", "/room-bookings/mine", customer.token);
    expect(mine.body.data).toHaveLength(1);
    expect(
      (await api("get", "/room-bookings/mine", (await actor("CUSTOMER")).token)).body.data,
    ).toHaveLength(0);
  });

  it("requires a customer account", async () => {
    const h = await hotel("B2");
    await api("post", "/room-bookings").send(bookingBody(h)).expect(401);
    const waiter = await actor("WAITER", h.branch.id);
    await api("post", "/room-bookings", waiter.token).send(bookingBody(h)).expect(403);
  });

  it("rejects bad input: party size, extras, guests and unknown types", async () => {
    const h = await hotel("B3");
    const customer = await actor("CUSTOMER");
    const post = (extra: Record<string, unknown>) =>
      api("post", "/room-bookings", customer.token).send(bookingBody(h, extra));

    expect((await post({ adults: 3 })).status).toBe(400); // Standard sleeps 2
    expect(
      (await post({ extras: [{ extraId: "00000000-0000-4000-8000-000000000000", quantity: 1 }] }))
        .status,
    ).toBe(400);
    expect((await post({ additionalGuests: [{ name: "A" }, { name: "B" }] })).status).toBe(400); // more than party
    expect((await post({ roomTypeId: "00000000-0000-4000-8000-000000000000" })).status).toBe(400);
    expect((await post({ guestEmail: "nope" })).status).toBe(400);
    expect((await post({ checkOut: futureDate(20) })).status).toBe(400);

    await prisma.roomExtra.update({ where: { id: h.extra.id }, data: { isActive: false } });
    expect((await post({ extras: [{ extraId: h.extra.id, quantity: 1 }] })).status).toBe(400); // inactive extra
    // A closed branch takes no bookings.
    const closed = await createBranch("B3c", { timezone: TZ, status: "CLOSED" });
    const closedType = await prisma.roomType.create({
      data: {
        branchId: closed.id,
        name: "X",
        slug: "x",
        maximumGuests: 2,
        bedType: "DOUBLE",
        basePrice: 1,
      },
    });
    const refused = await api("post", "/room-bookings", customer.token).send(
      bookingBody(h, { branchId: closed.id, roomTypeId: closedType.id }),
    );
    expect(refused.body.error.code).toBe("BRANCH_NOT_OPEN");
  });

  it("prevents double booking, allows back-to-back stays, and releases rooms on cancellation", async () => {
    const h = await hotel("B4");
    const [a, b, c] = [await actor("CUSTOMER"), await actor("CUSTOMER"), await actor("CUSTOMER")];
    const book = (token: string, s: Record<string, unknown>) =>
      api("post", "/room-bookings", token).send(bookingBody(h, s));

    const first = await book(a.token, {});
    const second = await book(b.token, {});
    expect([first.body.data.roomNumber, second.body.data.roomNumber]).toEqual(["101", "102"]);

    const full = await book(c.token, {});
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("ROOM_UNAVAILABLE");
    // A partial overlap also clashes.
    expect(
      (await book(c.token, { checkIn: futureDate(21), checkOut: futureDate(24) })).status,
    ).toBe(409);
    // Arriving the day the others leave is fine.
    expect(
      (await book(c.token, { checkIn: futureDate(22), checkOut: futureDate(24) })).status,
    ).toBe(201);

    // Cancelling frees the room for the original dates.
    await api("post", `/room-bookings/${first.body.data.id}/cancel`, a.token).expect(200);
    const rebooked = await book(c.token, {});
    expect(rebooked.status).toBe(201);
    expect(rebooked.body.data.roomNumber).toBe("101");
  });

  it("lets exactly one of many simultaneous requests take the last room", async () => {
    const h = await hotel("B5");
    const customers = await Promise.all(Array.from({ length: 6 }, () => actor("CUSTOMER")));
    const results = await Promise.all(
      customers.map((c) =>
        api("post", "/room-bookings", c.token).send(bookingBody(h, { roomTypeId: h.family.id })),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await prisma.roomBooking.count({ where: { branchId: h.branch.id } })).toBe(1);
  });

  it("spreads simultaneous requests across the available rooms", async () => {
    const h = await hotel("B6");
    const customers = await Promise.all(Array.from({ length: 5 }, () => actor("CUSTOMER")));
    const results = await Promise.all(
      customers.map((c) => api("post", "/room-bookings", c.token).send(bookingBody(h))),
    );
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(2);
    expect(new Set(ok.map((r) => r.body.data.roomNumber)).size).toBe(2);
  });

  it("limits upcoming stays per customer", async () => {
    const h = await hotel("B7");
    const customer = await actor("CUSTOMER");
    for (let i = 0; i < 5; i++) {
      await api("post", "/room-bookings", customer.token)
        .send(
          bookingBody(h, {
            roomTypeId: h.family.id,
            checkIn: futureDate(40 + i * 3),
            checkOut: futureDate(42 + i * 3),
            adults: 1,
          }),
        )
        .expect(201);
    }
    const sixth = await api("post", "/room-bookings", customer.token).send(
      bookingBody(h, {
        roomTypeId: h.family.id,
        checkIn: futureDate(90),
        checkOut: futureDate(92),
        adults: 1,
      }),
    );
    expect(sixth.body.error.code).toBe("TOO_MANY_BOOKINGS");
  });
});

describe("cancelling a stay", () => {
  it("is limited to the owner and to the free-cancellation window", async () => {
    const h = await hotel("C1");
    const owner = await actor("CUSTOMER");
    const res = await api("post", "/room-bookings", owner.token).send(bookingBody(h));
    const id = res.body.data.id;
    await api("post", `/room-bookings/${id}/cancel`, (await actor("CUSTOMER")).token).expect(404);

    const settings = await prisma.companySettings.findFirstOrThrow();
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { cancellationWindowHours: 24 * 60 },
    });
    try {
      const late = await api("post", `/room-bookings/${id}/cancel`, owner.token);
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe("CANCELLATION_WINDOW_PASSED");
      expect((await api("get", "/room-bookings/mine", owner.token)).body.data[0].canCancel).toBe(
        false,
      );
    } finally {
      await prisma.companySettings.update({
        where: { id: settings.id },
        data: { cancellationWindowHours: settings.cancellationWindowHours },
      });
    }
    const ok = await api("post", `/room-bookings/${id}/cancel`, owner.token);
    expect(ok.body.data.status).toBe("CANCELLED");
    await api("post", `/room-bookings/${id}/cancel`, owner.token).expect(409);
  });
});

describe("check-in, check-out and housekeeping", () => {
  it("runs a stay end to end: check-in, check-out, dirty room, cleaning, back in service", async () => {
    const h = await hotel("D1");
    const customer = await actor("CUSTOMER");
    const manager = await actor("MANAGER", h.branch.id);
    const waiter = await actor("WAITER", h.branch.id);

    const today = todayLocal();
    const tomorrow = futureDate(1);
    const created = await api("post", "/room-bookings", customer.token).send(
      bookingBody(h, { checkIn: today, checkOut: tomorrow }),
    );
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const roomId = created.body.data.roomId;
    const status = (token: string, next: string) =>
      api("patch", `/room-bookings/${id}/status`, token).send({ status: next });

    // Floor staff cannot run the front desk.
    await status(waiter.token, "CHECKED_IN").expect(403);
    await status(manager.token, "CHECKED_OUT").expect(409); // cannot skip check-in

    // The room is dirty until housekeeping says otherwise: check-in is refused.
    await prisma.room.update({ where: { id: roomId }, data: { housekeepingStatus: "DIRTY" } });
    const notReady = await status(manager.token, "CHECKED_IN");
    expect(notReady.status).toBe(409);
    expect(notReady.body.error.code).toBe("ROOM_NOT_READY");
    await api("patch", `/housekeeping/rooms/${roomId}`, waiter.token)
      .send({ housekeepingStatus: "CLEAN" })
      .expect(200);

    const checkedIn = await status(manager.token, "CHECKED_IN");
    expect(checkedIn.body.data.status).toBe("CHECKED_IN");
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomId } })).status).toBe(
      "OCCUPIED",
    );

    const overview = await api("get", `/rooms/overview?branchId=${h.branch.id}`, manager.token);
    expect(overview.body.data).toMatchObject({
      totalRooms: 3,
      occupied: 1,
      inHouse: 1,
      departuresToday: 0,
    });
    expect(overview.body.data.occupancyPercent).toBe(33);
    const rooms = await api("get", `/rooms?branchId=${h.branch.id}`, manager.token);
    expect(rooms.body.data.find((r: { id: string }) => r.id === roomId)).toMatchObject({
      currentGuest: "Ada Lovelace",
      status: "OCCUPIED",
    });

    // An occupied room cannot be taken out of service.
    await api("patch", `/rooms/${roomId}/status`, manager.token)
      .send({ status: "MAINTENANCE" })
      .expect(409);

    const out = await status(manager.token, "CHECKED_OUT");
    expect(out.body.data.status).toBe("CHECKED_OUT");
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room).toMatchObject({ status: "CLEANING", housekeepingStatus: "DIRTY" });

    const tasks = await api("get", `/housekeeping/tasks?branchId=${h.branch.id}`, waiter.token);
    expect(tasks.body.data).toHaveLength(1);
    expect(tasks.body.data[0]).toMatchObject({ roomId, type: "CHECKOUT_CLEAN", status: "OPEN" });

    // Finishing the task cleans the room and returns it to service.
    const done = await api(
      "patch",
      `/housekeeping/tasks/${tasks.body.data[0].id}`,
      waiter.token,
    ).send({ status: "DONE" });
    expect(done.body.data.status).toBe("DONE");
    expect(await prisma.room.findUniqueOrThrow({ where: { id: roomId } })).toMatchObject({
      status: "AVAILABLE",
      housekeepingStatus: "CLEAN",
    });
    expect(
      (await api("get", `/housekeeping/tasks?branchId=${h.branch.id}`, waiter.token)).body.data,
    ).toHaveLength(0);
  });

  it("enforces check-in dates and room assignment", async () => {
    const h = await hotel("D2");
    const customer = await actor("CUSTOMER");
    const manager = await actor("MANAGER", h.branch.id);
    const future = await api("post", "/room-bookings", customer.token).send(bookingBody(h));
    const early = await api(
      "patch",
      `/room-bookings/${future.body.data.id}/status`,
      manager.token,
    ).send({ status: "CHECKED_IN" });
    expect(early.body.error.code).toBe("TOO_EARLY");

    // Reassign to the other room of the booked type; the family room is the wrong type.
    const free = await api(
      "get",
      `/room-bookings/${future.body.data.id}/free-rooms`,
      manager.token,
    );
    expect(free.body.data.map((r: { roomNumber: string }) => r.roomNumber)).toEqual(["102"]);
    const moved = await api(
      "patch",
      `/room-bookings/${future.body.data.id}/room`,
      manager.token,
    ).send({ roomId: free.body.data[0].id });
    expect(moved.body.data.roomNumber).toBe("102");
    await api("patch", `/room-bookings/${future.body.data.id}/room`, manager.token)
      .send({ roomId: h.rooms[2]!.id })
      .expect(400);

    // A room held by another booking cannot be taken.
    const other = await api("post", "/room-bookings", (await actor("CUSTOMER")).token).send(
      bookingBody(h),
    );
    expect(other.body.data.roomNumber).toBe("101");
    await api("patch", `/room-bookings/${other.body.data.id}/room`, manager.token)
      .send({ roomId: h.rooms[1]!.id })
      .expect(409);
  });

  it("validates status transitions", async () => {
    const h = await hotel("D3");
    const customer = await actor("CUSTOMER");
    const manager = await actor("MANAGER", h.branch.id);
    const res = await api("post", "/room-bookings", customer.token).send(bookingBody(h));
    const id = res.body.data.id;
    const set = (s: string) =>
      api("patch", `/room-bookings/${id}/status`, manager.token).send({ status: s });
    await set("BOGUS").expect(400);
    await set("CHECKED_OUT").expect(409);
    expect((await set("NO_SHOW")).body.data.status).toBe("NO_SHOW");
    await set("CONFIRMED").expect(409); // terminal
    // The no-show released the room.
    await api("post", "/room-bookings", (await actor("CUSTOMER")).token)
      .send(bookingBody(h))
      .expect(201);
  });
});

describe("room inventory management", () => {
  it("manages room types and rooms with branch isolation and role limits", async () => {
    const h = await hotel("E1");
    const manager = await actor("MANAGER", h.branch.id);
    const stranger = await actor("MANAGER", (await createBranch("E1b")).id);
    const waiter = await actor("WAITER", h.branch.id);

    const type = await api("post", "/room-types", manager.token).send({
      branchId: h.branch.id,
      name: "Suite",
      maximumGuests: 3,
      bedType: "KING",
      numberOfBeds: 1,
      basePrice: 45000,
      weekendPrice: 52000,
      amenities: ["Wi-Fi", "Bathtub"],
    });
    expect(type.status).toBe(201);
    expect(type.body.data).toMatchObject({ slug: "suite", basePrice: 45000, weekendPrice: 52000 });
    await api("post", "/room-types", manager.token)
      .send({
        branchId: h.branch.id,
        name: "Bad",
        maximumGuests: 2,
        bedType: "DOUBLE",
        numberOfBeds: 1,
        basePrice: 1,
        amenities: ["Hot tub"],
      })
      .expect(400);
    await api("post", "/room-types", manager.token)
      .send({
        branchId: h.branch.id,
        name: "Bad",
        maximumGuests: 2,
        bedType: "DOUBLE",
        numberOfBeds: 1,
        basePrice: 1,
        images: ["javascript:alert(1)"],
      })
      .expect(400);
    expect(
      (
        await api("post", "/room-types", manager.token).send({
          branchId: h.branch.id,
          name: "Suite",
          maximumGuests: 2,
          bedType: "DOUBLE",
          numberOfBeds: 1,
          basePrice: 1,
        })
      ).body.data.slug,
    ).toBe("suite-2");

    const room = await api("post", "/rooms", manager.token).send({
      branchId: h.branch.id,
      roomTypeId: type.body.data.id,
      roomNumber: "401",
      floor: 4,
    });
    expect(room.status).toBe(201);
    const dup = await api("post", "/rooms", manager.token).send({
      branchId: h.branch.id,
      roomTypeId: type.body.data.id,
      roomNumber: "401",
    });
    expect(dup.body.error.code).toBe("ROOM_NUMBER_TAKEN");
    const blocked = await api("delete", `/room-types/${type.body.data.id}`, manager.token);
    expect(blocked.body.error.code).toBe("ROOM_TYPE_IN_USE");

    // Isolation and roles.
    await api("get", `/room-types/admin?branchId=${h.branch.id}`, stranger.token).expect(403);
    await api("patch", `/room-types/${type.body.data.id}`, stranger.token)
      .send({ name: "Hijacked" })
      .expect(403);
    await api("post", "/rooms", stranger.token)
      .send({ branchId: h.branch.id, roomTypeId: type.body.data.id, roomNumber: "9" })
      .expect(403);
    await api("get", `/rooms?branchId=${h.branch.id}`, stranger.token).expect(403);
    await api("post", "/rooms", waiter.token)
      .send({ branchId: h.branch.id, roomTypeId: type.body.data.id, roomNumber: "9" })
      .expect(403);
    await api("get", `/rooms?branchId=${h.branch.id}`, waiter.token).expect(200); // housekeeping needs the list
    await api("get", `/room-types/admin?branchId=${h.branch.id}`, waiter.token).expect(403);
    for (const role of ["KITCHEN", "CASHIER", "CUSTOMER"] as const) {
      const a = await actor(role, role === "CUSTOMER" ? undefined : h.branch.id);
      await api("get", `/rooms?branchId=${h.branch.id}`, a.token).expect(403);
      await api("get", `/room-bookings?branchId=${h.branch.id}`, a.token).expect(403);
    }
  });

  it("will not take a room out of service while it holds upcoming bookings", async () => {
    const h = await hotel("E2");
    const customer = await actor("CUSTOMER");
    const manager = await actor("MANAGER", h.branch.id);
    const booked = await api("post", "/room-bookings", customer.token).send(bookingBody(h));
    const roomId = booked.body.data.roomId;

    const refused = await api("patch", `/rooms/${roomId}/status`, manager.token).send({
      status: "OUT_OF_SERVICE",
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("ROOM_HAS_BOOKINGS");
    await api("delete", `/rooms/${roomId}`, manager.token).expect(409);

    const spare = h.rooms[1]!.id;
    await api("patch", `/rooms/${spare}/status`, manager.token)
      .send({ status: "MAINTENANCE" })
      .expect(200);
    await api("patch", `/rooms/${spare}/status`, manager.token)
      .send({ status: "AVAILABLE" })
      .expect(200);
    await api("patch", `/rooms/${spare}/status`, manager.token)
      .send({ status: "OCCUPIED" })
      .expect(400); // not a manual status
  });

  it("manages extras, hiding inactive ones from guests", async () => {
    const h = await hotel("E3");
    const manager = await actor("MANAGER", h.branch.id);
    const created = await api("post", "/room-extras", manager.token).send({
      branchId: h.branch.id,
      name: "Spa voucher",
      price: 5000,
      pricingMode: "PER_STAY",
    });
    expect(created.status).toBe(201);
    expect((await api("get", `/room-extras?branchId=${h.branch.id}`)).body.data).toHaveLength(2);
    await api("patch", `/room-extras/${created.body.data.id}`, manager.token)
      .send({ isActive: false })
      .expect(200);
    expect((await api("get", `/room-extras?branchId=${h.branch.id}`)).body.data).toHaveLength(1);
    expect(
      (await api("get", `/room-extras/admin?branchId=${h.branch.id}`, manager.token)).body.data,
    ).toHaveLength(2);
    await api("delete", `/room-extras/${created.body.data.id}`, manager.token).expect(200);
    await api("post", "/room-extras", (await actor("WAITER", h.branch.id)).token)
      .send({
        branchId: h.branch.id,
        name: "X",
        price: 1,
      })
      .expect(403);
  });
});

describe("staff booking and listing", () => {
  it("books by phone, optionally pinning a room, and lists bookings for the branch only", async () => {
    const h = await hotel("F1");
    const manager = await actor("MANAGER", h.branch.id);
    const stranger = await actor("MANAGER", (await createBranch("F1b")).id);
    const phone = (extra: Record<string, unknown> = {}) =>
      api("post", "/room-bookings/staff", manager.token).send(bookingBody(h, extra));

    const pinned = await phone({ roomId: h.rooms[1]!.id });
    expect(pinned.status).toBe(201);
    expect(pinned.body.data.roomNumber).toBe("102");
    expect((await phone({ roomId: h.rooms[1]!.id })).status).toBe(409);
    expect((await phone()).body.data.roomNumber).toBe("101");
    expect((await phone()).status).toBe(409);

    const list = await api("get", `/room-bookings?branchId=${h.branch.id}`, manager.token);
    expect(list.body.data).toHaveLength(2);
    expect((await api("get", "/room-bookings", manager.token)).body.data).toHaveLength(2); // defaults to own branch
    await api("get", `/room-bookings?branchId=${h.branch.id}`, stranger.token).expect(403);
    await api("patch", `/room-bookings/${pinned.body.data.id}/status`, stranger.token)
      .send({ status: "CANCELLED" })
      .expect(403);
    await api("post", "/room-bookings/staff", stranger.token).send(bookingBody(h)).expect(403);
  });
});
