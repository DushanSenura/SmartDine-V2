import { createServer } from "node:http";

import { createApp } from "./app";
import { prisma } from "./config/database";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { startReminderJob } from "./jobs/reservationReminders";
import { createSocketServer } from "./sockets";
import { registerSocketServer } from "./sockets/emitter";

const httpServer = createServer(createApp());
const io = createSocketServer(httpServer);
registerSocketServer(io);

httpServer.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT, env: env.NODE_ENV }, "SmartDine API listening");
});

const stopReminders = startReminderJob();

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  stopReminders();
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
