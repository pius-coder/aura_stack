/**
 * Full-text search — `defineSearchIndex` + `ctx.db.search`.
 * Resolves: Requirements 26.1–26.6 (Task 17).
 *
 * Backed by PostgreSQL's native tsvector/tsquery full-text search.
 * The `defineSearchIndex` declaration generates migration SQL;
 * the `search` function executes ranked queries via `$queryRaw`.
 */

import { db } from "./db";
import type { AuraDb } from "./db";

export interface SearchIndexDefinition {
  model: string;
  fields: string[];
  filterFields?: string[];
  language?: string;
}

const searchIndexes = new Map<string, SearchIndexDefinition>();

/**
 * Declare a full-text search index on a Prisma model.
 * At startup this registers the index; the actual GIN index + tsvector
 * column must be created via a Prisma migration (custom SQL).
 */
export function defineSearchIndex(
  model: string,
  config: Omit<SearchIndexDefinition, "model">,
): SearchIndexDefinition {
  const def: SearchIndexDefinition = { model, ...config };
  searchIndexes.set(model, def);
  return def;
}

export function getSearchIndex(model: string): SearchIndexDefinition | null {
  return searchIndexes.get(model) ?? null;
}

export function listSearchIndexes(): SearchIndexDefinition[] {
  return [...searchIndexes.values()];
}

/**
 * Generate the SQL migration for a search index.
 * This is a helper for `aura:make search` — it outputs the SQL to paste
 * into a Prisma migration file.
 */
export function generateSearchIndexSQL(def: SearchIndexDefinition): string {
  const lang = def.language ?? "english";
  const weights = def.fields.map((f, i) => {
    const weight = i === 0 ? "A" : "B";
    return `setweight(to_tsvector('${lang}', coalesce("${f}", '')), '${weight}')`;
  });

  return [
    `-- Full-text search index for ${def.model}`,
    `ALTER TABLE "${def.model}" ADD COLUMN IF NOT EXISTS "search_vector" tsvector`,
    `  GENERATED ALWAYS AS (${weights.join(" || ")}) STORED;`,
    ``,
    `CREATE INDEX IF NOT EXISTS "${def.model}_search_idx"`,
    `  ON "${def.model}" USING GIN ("search_vector");`,
  ].join("\n");
}

export interface SearchOptions {
  query: string;
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface SearchResult<T> {
  items: T[];
  scores: number[];
}

/**
 * Execute a full-text search against a registered search index.
 */
export async function search<T = unknown>(
  model: string,
  options: SearchOptions,
  prisma: AuraDb = db,
): Promise<SearchResult<T>> {
  const def = searchIndexes.get(model);
  if (!def) {
    throw new Error(`[aura:search] No search index registered for model "${model}"`);
  }

  const lang = def.language ?? "english";
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  // Build WHERE clause for filters
  const filterClauses: string[] = [];
  const filterValues: unknown[] = [];
  let paramIdx = 2; // $1 is the query

  if (options.filter) {
    for (const [key, value] of Object.entries(options.filter)) {
      if (def.filterFields?.includes(key) && value !== undefined) {
        filterClauses.push(`"${key}" = $${paramIdx}`);
        filterValues.push(value);
        paramIdx++;
      }
    }
  }

  const whereFilter = filterClauses.length > 0
    ? `AND ${filterClauses.join(" AND ")}`
    : "";

  const sql = `
    SELECT *, ts_rank("search_vector", plainto_tsquery('${lang}', $1)) as _score
    FROM "${model}"
    WHERE "search_vector" @@ plainto_tsquery('${lang}', $1)
    ${whereFilter}
    ORDER BY _score DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = await prisma.$queryRawUnsafe(sql, options.query, ...filterValues) as Array<T & { _score: number }>;

  return {
    items: rows.map(({ _score, ...rest }) => rest as unknown as T),
    scores: rows.map((r) => r._score),
  };
}
