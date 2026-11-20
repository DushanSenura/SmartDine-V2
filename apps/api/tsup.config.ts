import { defineConfig } from "tsup";

export default defineConfig({
  // `seed` is runnable inside the production image (node dist/seed.js) to create the first Owner.
  entry: { server: "src/server.ts", seed: "prisma/seed.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript source, so it must be bundled into the API.
  noExternal: ["@smartdine/shared"],
});
