

import type { AuraClientManifest } from "@/aura/shared/manifest";
import type { RegisteredAuraOperation } from "./operation";

const operations = new Map<string, RegisteredAuraOperation>();

export function registerOperation(operation: RegisteredAuraOperation): void {
  if (operations.has(operation.name)) {
    console.warn(`[aura] Operation already registered (skipped): ${operation.name}`);
    return;
  }
  operations.set(operation.name, operation);
}

export function getOperation(name: string): RegisteredAuraOperation | null {
  return operations.get(name) ?? null;
}

export function listOperations(): RegisteredAuraOperation[] {
  return [...operations.values()];
}

export function getClientOperationManifest(): AuraClientManifest {
  return {
    operations: listOperations()
      .filter((operation) => operation.access !== "internal")
      .map((operation) => ({
        name: operation.name,
        type: operation.type,
        access: operation.access,
        entities: [...operation.entities],
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}
