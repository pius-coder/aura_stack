import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { auraServerOnlyPlugin } from "./src/aura/server/vite-server-only-plugin";

/**
 * Vite Configuration for TanStack Start + Aura
 *
 * This configuration sets up:
 * - TanStack Start with file-based routing in src/app/routes
 * - React plugin for JSX transformation
 * - Tailwind CSS for styling
 * - DevTools for development
 *
 * The Aura Hono app integration happens in src/entry-server.tsx,
 * which routes Aura-specific paths to Hono handlers before
 * delegating to TanStack Start's SSR renderer.
 */
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: { allowedHosts: ["orya.globalimex.online"] },
  plugins: [
    // Enforce server-only boundary - must run before bundlers
    auraServerOnlyPlugin(),

    // TanStack DevTools - must be first
    devtools(),

    // Tailwind CSS
    tailwindcss(),

    // TanStack Start configuration
    tanstackStart({
      router: {
        // File-based routes in src/app/routes
        routesDirectory: "app/routes",
        // Generated route tree output
        generatedRouteTree: "app/routeTree.gen.ts",
      },
    }),

    // React plugin for JSX
    viteReact(),
  ],
});

export default config;
