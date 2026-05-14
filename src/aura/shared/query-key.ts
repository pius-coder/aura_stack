/**
 * Clé de cache TanStack Query pour les opérations Aura.
 *
 * Partagée entre le serveur (`AuraHydration`, `prefetchAuraQuery`) et
 * le client (`useAuraQuery`) pour garantir que l'hydratation SSR
 * produise exactement la même clé que celle consommée côté client.
 */
export type AuraQueryKey = readonly ["aura", string, unknown?, unknown?];

export function auraQueryKey(
  operationName: string,
  input?: unknown,
  params?: unknown,
): AuraQueryKey {
  return ["aura", operationName, input, params] as const;
}
