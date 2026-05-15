/**
 * Aura Components — self-contained backend modules.
 * Resolves: Requirements 28.1–28.7 (Task 19).
 *
 * Components package reusable backend logic (auth, rate limiting, notifications)
 * with their own schema, operations, and data isolation.
 */

import type { RegisteredAuraOperation } from "../server/operation";

export interface ComponentConfig {
  [key: string]: { type: string; default?: unknown };
}

export interface ComponentDefinition<TConfig extends ComponentConfig = ComponentConfig> {
  readonly __auraComponent: true;
  readonly name: string;
  readonly schema: { models: string[] };
  readonly operations: Record<string, RegisteredAuraOperation>;
  readonly config: TConfig;
  readonly configValues: Record<string, unknown>;
}

export interface DefineComponentOptions<TConfig extends ComponentConfig> {
  schema: { models: string[] };
  operations: Record<string, RegisteredAuraOperation>;
  config?: TConfig;
}

const componentRegistry = new Map<string, ComponentDefinition>();

/**
 * Define a self-contained backend component.
 *
 * ```ts
 * export const AuraAuthComponent = defineComponent("auth", {
 *   schema: { models: ["AuraUser", "AuraSession"] },
 *   operations: { "auth.login": loginOp, "auth.register": registerOp },
 *   config: { sessionDuration: { type: "string", default: "7d" } },
 * });
 * ```
 */
export function defineComponent<TConfig extends ComponentConfig>(
  name: string,
  options: DefineComponentOptions<TConfig>,
): (configOverrides?: Partial<Record<keyof TConfig, unknown>>) => ComponentDefinition<TConfig> {
  return (configOverrides = {}) => {
    const configValues: Record<string, unknown> = {};
    if (options.config) {
      for (const [key, def] of Object.entries(options.config)) {
        configValues[key] = (configOverrides as Record<string, unknown>)[key] ?? def.default;
      }
    }

    const def: ComponentDefinition<TConfig> = {
      __auraComponent: true,
      name,
      schema: options.schema,
      operations: options.operations,
      config: options.config ?? ({} as TConfig),
      configValues,
    };

    componentRegistry.set(name, def);
    return def;
  };
}

export function getComponent(name: string): ComponentDefinition | null {
  return componentRegistry.get(name) ?? null;
}

export function listComponents(): ComponentDefinition[] {
  return [...componentRegistry.values()];
}

/**
 * Install a component — registers its operations in the Aura registry.
 */
export async function installComponent(component: ComponentDefinition): Promise<void> {
  const { registerOperation } = await import("../server/registry");
  for (const [_name, op] of Object.entries(component.operations)) {
    registerOperation(op);
  }
}
