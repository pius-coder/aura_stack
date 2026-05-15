"use client";

import { useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { OperationRef } from "@/aura/core/types";
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
  getOperationEntities,
} from "./manifest-cache";
import { auraQueryKey, type AuraQueryKey } from "@/aura/shared/query-key";

export { auraQueryKey };
export type { AuraQueryKey };

function resolveOperationName(ref: string | OperationRef): string {
  return typeof ref === "string" ? ref : ref._name;
}

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

type NarrowOperationRef<T> = T extends OperationRef<infer _TType, infer TInput, infer TOutput>
  ? { input?: TInput; data: TOutput }
  : { input?: unknown; data: unknown };

export interface UseAuraQueryOptions<TData> extends Omit<
  UseQueryOptions<TData, Error, TData, AuraQueryKey>,
  "queryKey" | "queryFn"
> {
  input?: unknown;
  params?: unknown;
  showBumps?: boolean;
}

// Overload 1 — typed `OperationRef` from `_generated/api.ts`. Inputs and
// output are inferred from the ref.
export function useAuraQuery<TRef extends OperationRef>(
  operationRef: TRef,
  options?: UseAuraQueryOptions<NarrowOperationRef<TRef>["data"]> & {
    input?: NarrowOperationRef<TRef>["input"];
  },
): ReturnType<typeof useQuery<NarrowOperationRef<TRef>["data"], Error, NarrowOperationRef<TRef>["data"], AuraQueryKey>>;
// Overload 2 — legacy string name with an explicit generic.
export function useAuraQuery<TData = unknown>(
  operationName: string,
  options?: UseAuraQueryOptions<TData>,
): ReturnType<typeof useQuery<TData, Error, TData, AuraQueryKey>>;
export function useAuraQuery(
  operationRef: string | OperationRef,
  options: UseAuraQueryOptions<unknown> & { input?: unknown } = {},
) {
  const operationName = resolveOperationName(operationRef);
  const { input, params, showBumps = true, ...queryOptions } = options;
  const entities = getOperationEntities(operationName);

  return useQuery({
    ...(queryOptions as UseQueryOptions<unknown, Error, unknown, AuraQueryKey>),
    queryKey: auraQueryKey(operationName, input, params),
    queryFn: async ({ signal }) => {
      const result = await callAuraOperationWithMeta({
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

// Overload 1 — typed `OperationRef` from `_generated/api.ts`. Input/output
// are inferred from the operation's Zod schemas at the call site.
export function useAuraMutation<TRef extends OperationRef<"mutate" | "action">>(
  operationRef: TRef,
  options?: UseAuraMutationOptions<
    NarrowOperationRef<TRef>["input"],
    NarrowOperationRef<TRef>["data"]
  >,
): ReturnType<
  typeof useMutation<
    NarrowOperationRef<TRef>["data"],
    Error,
    NarrowOperationRef<TRef>["input"]
  >
>;
// Overload 2 — legacy string name with explicit generics.
export function useAuraMutation<TInput = void, TData = unknown>(
  operationName: string,
  options?: UseAuraMutationOptions<TInput, TData>,
): ReturnType<typeof useMutation<TData, Error, TInput>>;
export function useAuraMutation(
  operationRef: string | OperationRef,
  options: UseAuraMutationOptions<unknown, unknown> = {},
) {
  const operationName = resolveOperationName(operationRef);
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
    mutationFn: async (input: unknown) => {
      const result = await callAuraOperationWithMeta<unknown>({
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

      if (refresh && meta?.refresh) router.invalidate();
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
