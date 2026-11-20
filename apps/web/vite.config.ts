import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // The monorepo keeps a single .env at the repository root.
  const env = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "");
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:4000";

  return {
    // Only VITE_-prefixed variables from the root .env ever reach browser code.
    envDir: path.resolve(import.meta.dirname, "../.."),
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/socket.io": { target: apiTarget, ws: true },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./tests/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    },
  };
});
