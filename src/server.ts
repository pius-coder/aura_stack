/**
 * TanStack Start Server Entry Point
 *
 * This file creates the server-side handler for TanStack Start SSR.
 * It mounts the Aura Hono app for Aura-specific routes and delegates
 * everything else to TanStack Start's renderer.
 *
 * Requirement 2.2: TanStack Start as the React meta-framework
 * Requirement 1.13: Hono app factory for Aura HTTP routes
 */
import {
  createStartHandler,
  defaultStreamHandler,
  type RequestHandler,
} from "@tanstack/react-start/server";
import { createAuraHonoApp } from "./aura/server/hono-app";
import type { Register } from "@tanstack/react-router";

// Side-effect import: pulls every operation file into the registry on
// server boot so that `getOperation(name)` can resolve them.
import "./operations/_registry";

// Create the Aura Hono app instance
const honoApp = createAuraHonoApp();

// Create the TanStack Start handler with streaming SSR
const startFetch = createStartHandler(defaultStreamHandler);

// Define the server entry type
type ServerEntry = { fetch: RequestHandler<Register> };

/**
 * Creates a server entry that routes requests between Aura Hono handlers
 * and TanStack Start's SSR renderer.
 */
function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      // Route Aura-owned paths to Hono
      // These paths are handled by the Aura framework's HTTP layer:
      // - /aura/* — Public bridge for operation calls
      // - /aura-internal/* — Internal cron/trigger endpoint
      // - /files/* — Static file serving
      // - /health — Health check endpoint
      if (
        url.pathname.startsWith("/aura/") ||
        url.pathname.startsWith("/aura-http/") ||
        url.pathname.startsWith("/aura-internal/") ||
        url.pathname.startsWith("/files/") ||
        url.pathname === "/health"
      ) {
        return honoApp.fetch(request);
      }

      // Everything else goes to TanStack Start's SSR handler
      return entry.fetch(request);
    },
  };
}

export default createServerEntry({ fetch: startFetch });
