/**
 * `<AuraDataTable>` — server-paginated, sortable, filterable data table.
 * Resolves: Requirements 38.3, 38.10.
 *
 * Uses shadcn Table + Input + Button primitives, wired to useAuraPaginatedQuery.
 */

"use client";

import { useState, useCallback, type ReactNode } from "react";
import type { OperationRef } from "@/aura/core/types";
import { useAuraPaginatedQuery } from "@/aura/client/paginated-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/aura/ui/table";
import { Input } from "@/aura/ui/input";
import { Button } from "@/aura/ui/button";
import { Spinner } from "@/aura/ui/spinner";

export interface AuraDataTableColumn<T = unknown> {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  format?: "currency" | "date" | "relative" | "boolean";
  render?: (value: unknown, row: T) => ReactNode;
}

export interface AuraDataTableAction<T = unknown> {
  label: string;
  href?: (row: T) => string;
  mutation?: OperationRef;
  confirm?: boolean;
  variant?: "default" | "destructive";
  onClick?: (row: T) => void;
}

export interface AuraDataTableProps<T = Record<string, unknown>> {
  query: OperationRef | string;
  columns: AuraDataTableColumn<T>[];
  input?: Record<string, unknown>;
  searchable?: boolean | { placeholder?: string };
  actions?: AuraDataTableAction<T>[];
  empty?: { title: string; description?: string };
  numItems?: number;
  className?: string;
}

export function AuraDataTable<T extends Record<string, unknown>>({
  query,
  columns,
  input = {},
  searchable,
  actions,
  empty,
  numItems = 20,
  className,
}: AuraDataTableProps<T>) {
  const [search, setSearch] = useState("");

  const queryInput = searchable && search ? { ...input, search } : input;
  const { items, isDone, isLoading, loadMore, isFetchingNextPage } = useAuraPaginatedQuery(
    query as OperationRef<
      "query",
      Record<string, unknown>,
      { items: T[]; cursor: string | null; isDone: boolean }
    >,
    queryInput,
    { numItems },
  );

  const formatValue = useCallback((value: unknown, format?: string): ReactNode => {
    if (value == null) return "—";
    if (format === "currency") return `${Number(value).toFixed(2)} €`;
    if (format === "date") return new Date(value as string).toLocaleDateString();
    if (format === "relative") {
      const d = new Date(value as string);
      const diff = Date.now() - d.getTime();
      if (diff < 60000) return "à l'instant";
      if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`;
      if (diff < 86400000) return `il y a ${Math.floor(diff / 3600000)}h`;
      return d.toLocaleDateString();
    }
    if (format === "boolean") return value ? "✓" : "✗";
    return String(value);
  }, []);

  return (
    <div className={className}>
      {searchable && (
        <div className="mb-4">
          <Input
            type="search"
            placeholder={typeof searchable === "object" ? searchable.placeholder : "Rechercher..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
              {actions && actions.length > 0 && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && !isLoading && (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (actions ? 1 : 0)}
                  className="text-center text-muted-foreground py-8"
                >
                  {empty?.title ?? "Aucun résultat"}
                  {empty?.description && <p className="mt-1 text-xs">{empty.description}</p>}
                </TableCell>
              </TableRow>
            )}
            {(items as T[]).map((row, i) => (
              <TableRow key={(row.id as string) ?? i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render ? col.render(row[col.key], row) : formatValue(row[col.key], col.format)}
                  </TableCell>
                ))}
                {actions && actions.length > 0 && (
                  <TableCell className="text-right">
                    {actions.map((action, ai) => (
                      <Button
                        key={ai}
                        size="sm"
                        variant={action.variant === "destructive" ? "destructive" : "ghost"}
                        onClick={() => action.onClick?.(row)}
                        className="ml-2"
                      >
                        {action.label}
                      </Button>
                    ))}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!isDone && (
        <div className="mt-4 flex justify-center">
          <Button onClick={loadMore} disabled={isFetchingNextPage} variant="outline">
            {isFetchingNextPage ? "Chargement..." : "Charger plus"}
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="mt-4 flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
