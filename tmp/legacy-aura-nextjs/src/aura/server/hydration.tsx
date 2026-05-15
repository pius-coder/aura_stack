import { QueryClient, dehydrate } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuraHydrationBoundary } from "@/aura/client/hydration-boundary";
import { auraQueryKey } from "@/aura/shared/query-key";
import { callAuraServer } from "./call";
import type { AuraSource } from "./context";

export interface AuraHydrationProps {
  /**
   * Fonction de prefetch exécutée côté serveur.
   * Reçoit un QueryClient frais pour pré-remplir le cache.
   */
  prefetch: (queryClient: QueryClient) => Promise<void>;
  children: ReactNode;
}

/**
 * Wrapper serveur (RSC) pour préfecther des données TanStack Query
 * et les hydrater côté client via `<AuraHydrationBoundary>`.
 *
 * Usage :
 * ```tsx
 * export default async function Page() {
 *   return (
 *     <AuraHydration
 *       prefetch={async (queryClient) => {
 *         await queryClient.prefetchQuery({
 *           queryKey: ["aura", "todo.list"],
 *           queryFn: () => callAuraServer({ operationName: "todo.list", source: "rsc" }),
 *         });
 *       }}
 *     >
 *       <TodoListClient />
 *     </AuraHydration>
 *   );
 * }
 * ```
 */
export async function AuraHydration({
  prefetch,
  children,
}: AuraHydrationProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: false,
      },
    },
  });

  await prefetch(queryClient);

  const dehydratedState = dehydrate(queryClient);

  return (
    <AuraHydrationBoundary state={dehydratedState}>
      {children}
    </AuraHydrationBoundary>
  );
}

export interface PrefetchAuraQueryOptions {
  operationName: string;
  input?: unknown;
  params?: unknown;
  source?: AuraSource;
}

/**
 * Prefetch an Aura query server-side using the **exact** same query key as
 * the client. Use this from RSC page components instead of writing the key
 * by hand — writing the key by hand tends to drift from the client shape
 * (`["aura", name, input, params]`) and silently breaks hydration.
 *
 * Usage:
 * ```tsx
 * export default async function Page({ params }) {
 *   const { slug } = await params;
 *   return (
 *     <AuraHydration
 *       prefetch={async (qc) =>
 *         prefetchAuraQuery(qc, {
 *           operationName: "catalog.productBySlug",
 *           params: { slug },
 *         })
 *       }
 *     >
 *       <ProductPage slug={slug} />
 *     </AuraHydration>
 *   );
 * }
 * ```
 */
export async function prefetchAuraQuery(
  queryClient: QueryClient,
  options: PrefetchAuraQueryOptions,
): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: auraQueryKey(options.operationName, options.input, options.params),
    queryFn: () =>
      callAuraServer({
        operationName: options.operationName,
        input: options.input,
        params: options.params,
        source: options.source ?? "rsc",
      }),
  });
}
