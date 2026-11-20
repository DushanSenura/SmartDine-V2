import { prisma } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { describeWhen, events } from "../modules/notifications/notify.events";

/**
 * Reminds customers of confirmed reservations that start within the reminder window.
 * Safe to run as often as you like and from several processes: a reservation is claimed with a
 * conditional update, so only one run ever reminds a given customer. Returns how many were sent.
 */
export async function sendReservationReminders(
  now: Date = new Date(),
  windowHours: number = env.RESERVATION_REMINDER_HOURS,
): Promise<number> {
  const horizon = new Date(now.getTime() + windowHours * 3_600_000);
  const due = await prisma.restaurantReservation.findMany({
    where: {
      status: "CONFIRMED",
      userId: { not: null },
      reminderSentAt: null,
      startsAt: { gt: now, lte: horizon },
    },
    select: { id: true, branchId: true, userId: true, reference: true, startsAt: true },
    take: 500,
  });

  let sent = 0;
  for (const r of due) {
    const claimed = await prisma.restaurantReservation.updateMany({
      where: { id: r.id, reminderSentAt: null, status: "CONFIRMED" },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0) continue; // another run got there first
    sent += 1;
    await events.reservationReminder({
      branchId: r.branchId,
      userId: r.userId,
      reference: r.reference,
      when: await describeWhen(r.branchId, r.startsAt),
    });
  }
  return sent;
}

/** Starts the recurring job; returns a function that stops it. A zero interval disables it. */
export function startReminderJob(): () => void {
  const minutes = env.REMINDER_JOB_INTERVAL_MINUTES;
  if (minutes === 0) return () => undefined;

  let running = false;
  const tick = async () => {
    if (running) return; // never overlap with a slow previous run
    running = true;
    try {
      const sent = await sendReservationReminders();
      if (sent > 0) logger.info({ sent }, "Reservation reminders sent");
    } catch (error) {
      logger.error({ err: error }, "Reservation reminder job failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), minutes * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
