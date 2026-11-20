import { defineConfig } from "vitest/config";

const DEFAULT_TEST_DB =
  "postgresql://smartdine:smartdine_dev_password@localhost:5432/smartdine?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Integration tests use the real database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_TEST_DB,
      JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123456",
      BCRYPT_ROUNDS: "4",
      LOG_LEVEL: "silent",
    },
  },
});
