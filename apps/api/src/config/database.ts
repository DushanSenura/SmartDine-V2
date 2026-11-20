import { PrismaClient } from "@prisma/client";

import { env } from "./env";

/** Single shared Prisma client for the process. */
export const prisma = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
