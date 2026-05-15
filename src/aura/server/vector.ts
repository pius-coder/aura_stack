/**
 * Vector search — `defineVectorIndex` + `ctx.db.vectorSearch`.
 * Resolves: Requirements 27.1–27.7 (Task 18).
 *
 * Backed by PostgreSQL's pgvector extension (cosine similarity by default).
 */

import { db } from "./db";
import type { AuraDb } from "./db";
import { AuraError } from "@/aura/core/errors";

export interface VectorIndexDefinition {
  model: string;
  vectorField: string;
  dimensions: number;
  filterFields?: string[];
  indexType?: "hnsw" | "ivfflat";
}

const vectorIndexes = new Map<string, VectorIndexDefinition>();

export function defineVectorIndex(
  model: string,
  config: Omit<VectorIndexDefinition, "model">,
): VectorIndexDefinition {
  const def: VectorIndexDefinition = { model, ...config };
  vectorIndexes.set(model, def);
  return def;
}

export function getVectorIndex(model: string): VectorIndexDefinition | null {
  return vectorIndexes.get(model) ?? null;
}

export function listVectorIndexes(): VectorIndexDefinition[] {
  return [...vectorIndexes.values()];
}

/**
 * Generate the SQL migration for a vector index.
 */
export function generateVectorIndexSQL(def: VectorIndexDefinition): string {
  const indexType = def.indexType ?? "hnsw";
  return [
    `-- Vector index for ${def.model}`,
    `CREATE EXTENSION IF NOT EXISTS vector;`,
    ``,
    `ALTER TABLE "${def.model}" ADD COLUMN IF NOT EXISTS "${def.vectorField}" vector(${def.dimensions});`,
    ``,
    `CREATE INDEX IF NOT EXISTS "${def.model}_${def.vectorField}_idx"`,
    `  ON "${def.model}" USING ${indexType} ("${def.vectorField}" vector_cosine_ops);`,
  ].join("\n");
}

export interface VectorSearchOptions {
  vector: number[];
  limit?: number;
  filter?: Record<string, unknown>;
}

export interface VectorSearchResult<T> {
  items: T[];
  distances: number[];
}

/**
 * Execute a vector similarity search against a registered vector index.
 */
export async function vectorSearch<T = unknown>(
  model: string,
  options: VectorSearchOptions,
  prisma: AuraDb = db,
): Promise<VectorSearchResult<T>> {
  const def = vectorIndexes.get(model);
  if (!def) {
    throw new Error(`[aura:vector] No vector index registered for model "${model}"`);
  }

  // Validate dimensionality
  if (options.vector.length !== def.dimensions) {
    throw new AuraError(
      "BAD_REQUEST",
      `Vector dimension mismatch: expected ${def.dimensions}, got ${options.vector.length}`,
    );
  }

  const limit = options.limit ?? 10;
  const vectorStr = `[${options.vector.join(",")}]`;

  // Build filter clauses
  const filterClauses: string[] = [];
  const filterValues: unknown[] = [];
  let paramIdx = 1;

  if (options.filter) {
    for (const [key, value] of Object.entries(options.filter)) {
      if (def.filterFields?.includes(key) && value !== undefined) {
        filterClauses.push(`"${key}" = $${paramIdx}`);
        filterValues.push(value);
        paramIdx++;
      }
    }
  }

  const whereClause = filterClauses.length > 0
    ? `WHERE ${filterClauses.join(" AND ")}`
    : "";

  const sql = `
    SELECT *, "${def.vectorField}" <=> '${vectorStr}'::vector as _distance
    FROM "${model}"
    ${whereClause}
    ORDER BY _distance ASC
    LIMIT ${limit}
  `;

  const rows = await prisma.$queryRawUnsafe(sql, ...filterValues) as Array<T & { _distance: number }>;

  return {
    items: rows.map(({ _distance, ...rest }) => rest as unknown as T),
    distances: rows.map((r) => r._distance),
  };
}
