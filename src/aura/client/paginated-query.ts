/**
 * `useAuraPaginatedQuery` — cursor-based infinite scroll hook.
 * Resolves: Requirement 25.5 (Task 16.2).
 * Built on TanStack Query's `useInfiniteQuery`.
 */

"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { OperationRef } from "@/aura/core/types";
import { auraQueryKey } from "@/aura/shared/query-key";
import { callAuraOperation } from "./transport";

export interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;
  isDone: boolean;
}

export interface UseAuraPaginatedQueryOptions {
  numItems?: number;
  enabled?: boolean;
}

export function useAuraPaginatedQuery<TInput extends Record<string, unknown>, TOutput>(
  ref: OperationRef<"query", TInput, PaginatedResult<TOutput>> | string,
  input: Omit<TInput, "cursor" | "numItems">,
  options: UseAuraPaginatedQueryOptions = {},
) {
  const name = typeof ref === "string" ? ref : ref._name;
  const numItems = options.numItems ?? 20;

  const query = useInfiniteQuery<PaginatedResult<TOutput>>({
    queryKey: auraQueryKey(name, { ...input, numItems }) as readonly unknown[],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const fullInput = { ...input, cursor: pageParam, numItems };
      const data = await callAuraOperation<PaginatedResult<TOutput>>({
        operationName: name,
        input: fullInput,
      });
      return data;
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: options.enabled,
  });

  const allItems = query.data?.pages.flatMap((p) => p.items) ?? [];
  const isDone = query.data?.pages[query.data.pages.length - 1]?.isDone ?? false;

  return {
    items: allItems,
    isDone,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        query.fetchNextPage();
      }
    },
    error: query.error,
    refetch: query.refetch,
  };
}
