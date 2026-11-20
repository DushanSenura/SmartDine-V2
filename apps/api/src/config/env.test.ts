import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_ACCESS_SECRET: "k3Vq9xLw2ZpT7sRn5HdYb8UcJf4MgA6E",
};

describe("parseEnv", () => {
  it("accepts a minimal development environment and applies defaults", () => {
    const env = parseEnv({ ...base, NODE_ENV: "development" });
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:5173"]);
  });

  it("refuses a short secret in every environment", () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: "short" })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("refuses the .env.example placeholder secret in production only", () => {
    const placeholder = "change-me-to-a-long-random-string-of-at-least-32-chars";
    expect(() =>
      parseEnv({ ...base, NODE_ENV: "production", JWT_ACCESS_SECRET: placeholder }),
    ).toThrow(/placeholder/);
    expect(() =>
      parseEnv({ ...base, NODE_ENV: "development", JWT_ACCESS_SECRET: placeholder }),
    ).not.toThrow();
  });

  it("refuses weak password hashing in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", BCRYPT_ROUNDS: "6" })).toThrow(
      /BCRYPT_ROUNDS/,
    );
    expect(() => parseEnv({ ...base, NODE_ENV: "production", BCRYPT_ROUNDS: "12" })).not.toThrow();
  });

  it("reports every problem at once", () => {
    expect(() =>
      parseEnv({ NODE_ENV: "production", JWT_ACCESS_SECRET: "x", BCRYPT_ROUNDS: "4" }),
    ).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });
});
