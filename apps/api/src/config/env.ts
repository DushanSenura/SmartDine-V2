import { z } from "zod";

const PLACEHOLDER_SECRET = /change-?me|example|secret-here|password/i;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    /** Defaults to true in production; set false only for plain-http local Docker testing. */
    COOKIE_SECURE: z
      .preprocess(
        (value) => (value === "" ? undefined : value),
        z.enum(["true", "false"]).optional(),
      )
      .transform((value) => (value === undefined ? undefined : value === "true")),
    /** Per-IP limits per 15 minutes. Raise only in automated test environments. */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
    BOOKING_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
    /** Outgoing mail, e.g. smtps://user:pass@smtp.example.com. Unset = mail is not configured. */
    SMTP_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
    MAIL_FROM: z.string().min(3).default("SmartDine <no-reply@smartdine.local>"),
    /** How far ahead a customer is reminded of a reservation. */
    RESERVATION_REMINDER_HOURS: z.coerce.number().min(0.25).max(72).default(2),
    /** How often the reminder job runs; 0 turns it off. */
    REMINDER_JOB_INTERVAL_MINUTES: z.coerce.number().min(0).max(60).default(5),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;
    if (PLACEHOLDER_SECRET.test(value.JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message: "must be a real random secret in production, not the .env.example placeholder",
      });
    }
    if (value.BCRYPT_ROUNDS < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["BCRYPT_ROUNDS"],
        message: "must be at least 10 in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parses a raw environment; throws one readable error listing every problem. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Validated, typed environment. Fails fast at boot if configuration is wrong. */
export const env = parseEnv(process.env);
