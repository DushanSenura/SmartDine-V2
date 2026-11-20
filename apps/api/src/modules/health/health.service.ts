import type { Liveness, Readiness } from "@smartdine/shared";

import { prisma } from "../../config/database";
import { logger } from "../../config/logger";

export function getLiveness(): Liveness {
  return {
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

export async function getReadiness(): Promise<Readiness> {
  let database: Readiness["database"] = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.error({ err: error }, "Readiness check: database unreachable");
    database = "down";
  }
  return {
    status: database === "up" ? "ready" : "degraded",
    database,
    timestamp: new Date().toISOString(),
  };
}
