import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const livenessSchema = z.object({
  status: z.literal("ok"),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});

export const readinessSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  database: z.enum(["up", "down"]),
  timestamp: z.string(),
});

export type Liveness = z.infer<typeof livenessSchema>;
export type Readiness = z.infer<typeof readinessSchema>;

/**
 * A web URL. `z.url()` alone accepts any scheme (`javascript:`, `data:`…), which is unsafe for
 * values later rendered as links or images, so only http(s) is allowed.
 */
export const httpUrl = z.url({ protocol: /^https?$/, message: "Enter an http(s) URL" });
