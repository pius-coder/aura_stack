"use client";

import { useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AuraClientManifest } from "@/aura/shared/manifest";
import type { AuraBump } from "@/aura/core/envelope";
import {
  callAuraOperationWithMeta,
  fetchAuraManifest,
  AuraClientError,
} from "./transport";
import { useAuraBroadcast } from "./provider";
import {
  setManifestEntities,
  getOperationEntities,
} from "./manifest-cache";
import { auraQueryKey, type AuraQueryKey } from "@/aura/shared/query-key";

export { auraQueryKey };
export type { AuraQueryKey };

function displayAuraBumps(bumps: AuraBump[]): void {
  for (const bump of bumps) {
    switch (bump.variant) {
      case "success":
        toast.success(bump.title, { description: bump.description });
        break;
      case "info":
        toast.info(bump.title, { description: bump.description });
        break;
      case "warning":
        toast.warning(bump.title, { description: bump.description });
        break;
      case "error":
        toast.error(bump.title, { description: bump.description });
        break;
    }
  }
}

export interface UseAuraQueryOptions<TData> extends Omit<
  UseQueryOptions<TData, Error, TData, AuraQueryKey>,
  "queryKey" | "queryFn"
> {
  input?: unknown;
  params?: unknown;
  showBumps?: boolean;
}

export function useAuraQuery<TData = unknown>(
  operationName: string,
  options: UseAuraQueryOptions<TData> = {},
) {
  const { input, params, showBumps = true, ...queryOptions } = options;
  const entities = getOperationEntities(operationName);

  return useQuery({
    queryKey: auraQueryKey(operationName, input, params),
    queryFn: async ({ signal }) => {
      const result = await callAuraOperationWithMeta<TData>({
        operationName,
        input,
        params,
        signal,
      });
      if (showBumps) displayAuraBumps(result.meta.bumps);
      return result.data;
    },
    meta: {
      entities,
    },
    ...queryOptions,
  });
}

export interface UseAuraMutationOptions<TInput, TData> extends Omit<
  UseMutationOptions<TData, Error, TInput>,
  "mutationFn"
> {
  params?: unknown;
  invalidate?: string[];
  refresh?: boolean;
  showBumps?: boolean;
}

export function useAuraMutation<TInput = void, TData = unknown>(
  operationName: string,
  options: UseAuraMutationOptions<TInput, TData> = {},
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const broadcast = useAuraBroadcast();
  const {
    params,
    invalidate,
    refresh = true,
    showBumps = true,
    onSuccess,
    onError: userOnError,
    ...mutationOptions
  } = options;

  const lastMetaRef = useRef<{
    invalidates: string[];
    refresh: boolean;
  } | null>(null);

  return useMutation({
    mutationFn: async (input: TInput) => {
      const result = await callAuraOperationWithMeta<TData>({
        operationName,
        input,
        params,
      });
      if (showBumps) displayAuraBumps(result.meta.bumps);
      lastMetaRef.current = {
        invalidates: result.meta.invalidates,
        refresh: result.meta.refresh,
      };
      return result.data;
    },
    async onSuccess(data, variables, onMutateResult, context) {
      const meta = lastMetaRef.current;
      const explicitKeys = invalidate?.length ? invalidate : [];
      const entityKeys = meta?.invalidates?.length ? meta.invalidates : [];
      const allKeys = [...new Set([...explicitKeys, ...entityKeys])];
      if (allKeys.length === 0) allKeys.push(operationName);

      await queryClient.invalidateQueries({
        predicate: (query) => {
          const queryName = query.queryKey[1] as string;
          const metaEntities = (query.meta?.entities as string[]) || [];
          const manifestEntities = getOperationEntities(queryName);
          const queryEntities = [
            ...new Set([...metaEntities, ...manifestEntities]),
          ];
          const matched = allKeys.some(
            (key) => key === queryName || queryEntities.includes(key),
          );
          if (matched) {
            console.log(
              `[aura:invalidate] Matched query "${queryName}" via keys:`,
              allKeys,
              "entities:",
              queryEntities,
            );
          }
          return matched;
        },
      });

      const broadcastKeys = [...new Set([...entityKeys, operationName])];
      broadcast(broadcastKeys);

      if (refresh && meta?.refresh) router.refresh();
      await onSuccess?.(data, variables, onMutateResult, context);
    },
    onError(error, variables, onMutateResult, context) {
      if (showBumps) {
        const isFieldError =
          error instanceof AuraClientError &&
          error.fieldErrors &&
          Object.keys(error.fieldErrors).length > 0;

        if (!isFieldError) {
          toast.error(error.message || "Une erreur est survenue");
        }
      }
      userOnError?.(error, variables, onMutateResult, context);
    },
    ...mutationOptions,
  });
}

export function useAuraManifest() {
  return useQuery({
    queryKey: ["aura", "_manifest"],
    queryFn: ({ signal }) => fetchAuraManifest<AuraClientManifest>(signal),
    staleTime: 5 * 60_000,
  });
}
