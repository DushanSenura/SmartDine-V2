import { defineConfig } from "@playwright/test";

const external = process.env.E2E_BASE_URL;

/**
 * E2E runs against a live stack: PostgreSQL (migrated + seeded) plus API and web.
 * Locally, `npm run dev` is started automatically (or reused if already running).
 * Set E2E_BASE_URL to test an already-deployed stack (e.g. the Docker one on :8080).
 */
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: external ?? "http://localhost:5173",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: "npm run dev",
        cwd: "../..",
        // Through the dev proxy: only answers once the API is up as well as Vite, so the first
        // sign-in never races a still-starting API.
        url: "http://localhost:5173/api/v2/health",
        reuseExistingServer: false,
        // Many logins per run from one IP would trip the production auth rate limit.
        env: { AUTH_RATE_LIMIT_MAX: "10000", BOOKING_RATE_LIMIT_MAX: "10000" },
        timeout: 120_000,
      },
});
