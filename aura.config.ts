/**
 * Aura framework configuration.
 *
 * Per Requirement 37.9: configurable root directory for operations
 * (default: `src/operations/`). The `defineAuraConfig` helper provides
 * type-safe configuration with defaults filled in.
 *
 * Per Requirement 38.8: UI components live in `src/aura/ui/` with
 * kebab-case file names (e.g. `aura-data-table.tsx`).
 *
 * NOTE: `defineAuraConfig` is a placeholder until Phase 1 lands the
 * runtime config loader. Until then this file documents the intended
 * shape.
 */

export type AuraConfig = {
  /**
   * Root directory for operations (queries, mutations, actions),
   * middleware, crons, workflows, agents, etc.
   * @default "src/operations"
   */
  operationsDir?: string;

  /**
   * Directory for the auto-generated `_registry.ts` and other codegen
   * output (e.g. `_generated/api.ts`).
   * @default "src/aura/_generated"
   */
  generatedDir?: string;

  /**
   * Directory for the built-in UI kit components (kebab-case file names).
   * @default "src/aura/ui"
   */
  uiDir?: string;

  /**
   * Directory for TanStack Start application routes.
   * @default "src/app/routes"
   */
  routesDir?: string;

  /**
   * Whether `aura:doctor` enforces kebab-case naming convention for all
   * project files (operations, components, routes).
   * @default true
   */
  enforceKebabCase?: boolean;
};

/**
 * Helper for declaring an Aura configuration with type safety.
 * The runtime loader (Phase 1) will resolve defaults and validate.
 */
export function defineAuraConfig(config: AuraConfig): AuraConfig {
  return config;
}

export default defineAuraConfig({
  operationsDir: "src/operations",
  generatedDir: "src/aura/_generated",
  uiDir: "src/aura/ui",
  routesDir: "src/app/routes",
  enforceKebabCase: true,
});
