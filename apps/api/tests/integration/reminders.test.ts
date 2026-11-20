import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sendReservationReminders } from "../../src/jobs/reservationReminders";
import {
  actor,
  cleanupBranches,
  cleanupUsers,
  createBranch,
  prisma,
  setupDatabase,
} from "./helpers";
import { eventually, inbox } from "./fixtures";

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

const HOUR = 3_600_000;

describe("reservation reminders", () => {
  it("reminds a customer once, only for confirmed bookings starting inside the window", async () => {
    const branch = await createBranch("RM1", { timezone: "Asia/Colombo" });
    const customer = await actor("CUSTOMER");
    const now = new Date();

    const make = (reference: string, startsInHours: number, status = "CONFIRMED") =>
      prisma.restaurantReservation.create({
        data: {
          reference,
          type: "TABLE",
          status: status as "CONFIRMED",
          branchId: branch.id,
          userId: customer.userId,
          guestName: "Ada",
          guestEmail: "ada@example.com",
          guestPhone: "+94 77 123 4567",
          partySize: 2,
          startsAt: new Date(now.getTime() + startsInHours * HOUR),
          endsAt: new Date(now.getTime() + (startsInHours + 1.5) * HOUR),
        },
      });
    const soon = await make("RMSOON001", 1);
    await make("RMLATER001", 10); // outside the window
    await make("RMPEND0001", 1, "PENDING"); // not confirmed
    await make("RMCANC0001", 1, "CANCELLED");

    expect(await sendReservationReminders(now, 2)).toBe(1);
    // A second run (or a second process) must not remind again.
    expect(await sendReservationReminders(now, 2)).toBe(0);

    const mail = await eventually(
      () => inbox(customer.token),
      (b) => b.notifications.length > 0,
    );
    expect(mail.notifications).toHaveLength(1);
    expect(mail.notifications[0]).toMatchObject({
      type: "RESERVATION_REMINDER",
      link: "/account/reservations",
    });
    expect(mail.notifications[0]!.body).toContain("RMSOON001");
    expect(
      (await prisma.restaurantReservation.findUnique({ where: { id: soon.id } }))?.reminderSentAt,
    ).not.toBeNull();
  });
});
