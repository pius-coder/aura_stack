/**
 * Mock for the `server-only` package used in vitest.
 *
 * The real `server-only` package throws an error when imported outside a
 * React Server Component context. In tests we want to import server modules
 * freely, so this mock is a no-op.
 *
 * The alias is configured in `vitest.config.ts`.
 */
export {};
