import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Mock `server-only` so tests can import server modules without the
      // "Client Component" guard throwing. In the real app, the Vite plugin
      // enforces the boundary at build time; in tests we just want to run the
      // logic.
      "server-only": path.resolve(
        __dirname,
        "src/aura/test-utils/server-only-mock.ts",
      ),
      // Path aliases matching tsconfig.json `paths`
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
  },
});
