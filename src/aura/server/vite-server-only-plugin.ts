/**
 * Vite plugin that enforces the `server-only` boundary.
 *
 * Resolves: Requirement 2.9, 12.5
 *
 * Any module that imports the canonical `server-only` package gets a
 * synthetic export that throws if it ever ends up in a client bundle.
 * This mirrors Next.js's behavior: importing `server-only` is a
 * declaration that the file MUST NOT run on the client. If Vite tries
 * to bundle such a module into a client chunk, the build fails fast.
 *
 * The plugin also surfaces the same error at dev time when the client
 * graph references a server-only file.
 */

import type { Plugin } from "vite";

const SERVER_ONLY_ID = "server-only";
const RESOLVED_ID = "\0aura-server-only";

export function auraServerOnlyPlugin(): Plugin {
  return {
    name: "aura:server-only",
    enforce: "pre",

    resolveId(id) {
      if (id === SERVER_ONLY_ID) return RESOLVED_ID;
      return null;
    },

    load(id, options) {
      if (id !== RESOLVED_ID) return null;

      // ssr === false means this module is being pulled into a client bundle.
      // Throwing during load fails the build with a clear stack trace pointing
      // at the offending importer.
      if (options?.ssr === false) {
        throw new Error(
          "[aura] A module marked `server-only` was imported into a client bundle. " +
            "Move the import behind `createServerFn`, an Aura operation, or remove " +
            "the `import 'server-only'` directive if the file is safe on the client.",
        );
      }

      return "export {};";
    },
  };
}
