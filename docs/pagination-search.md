# Pagination & search

Aura ships three search/pagination primitives, each backed by Postgres:

| Primitive | Use case | Backed by |
|-----------|----------|-----------|
| Cursor pagination | Stable infinite scroll, large datasets | Prisma `cursor` + opaque HMAC-signed cursor string |
| Full-text search | Word-ranked product/article search | PostgreSQL `tsvector` + `tsquery` + GIN index |
| Vector search | Semantic similarity, RAG, recommendations | `pgvector` extension + HNSW/IVFFlat index |

## Cursor pagination

### Server (operation)

Use `ctx.paginate(model, opts)` from any handler:

```ts
defineOperationFn("todos.list")
  .query()
  .input(z.object({
    cursor: z.string().nullish(),
    numItems: z.number().int().positive().max(100).default(20),
    status: z.enum(["PENDING", "DONE"]).optional(),
  }))
  .entities(["Todo"])
  .public()
  .handler(async ({ ctx, input }) => {
    return ctx.paginate(ctx.db.todo, {
      where: input.status ? { status: input.status } : undefined,
      cursor: input.cursor ?? undefined,
      take: input.numItems,
      orderBy: "createdAt",
      direction: "desc",
      operationHash: "todos.list",
    });
  });
```

Returns `{ items: T[], cursor: string | null, isDone: boolean }`.

The cursor is `base64url(JSON.stringify({ id, operationHash })) + "." + HMAC_SHA256(secret, payload)`. Forging it (or replaying it against another operation) fails verification.

### Client (`useAuraPaginatedQuery`)

```tsx
import { useAuraPaginatedQuery } from "@/aura/client";
import { api } from "@/aura/_generated/api";

const { items, isDone, isLoading, loadMore, isFetchingNextPage } =
  useAuraPaginatedQuery(api.todos.list, { status: "PENDING" }, { numItems: 20 });

return (
  <>
    <ul>{items.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
    {!isDone && <button onClick={loadMore}>Load more</button>}
  </>
);
```

Internally uses TanStack Query's `useInfiniteQuery` with the cursor as `pageParam`.

### `<AuraDataTable>`

Wires automatically to `useAuraPaginatedQuery`:

```tsx
<AuraDataTable query={api.todos.list} columns={[…]} numItems={50} />
```

## Full-text search (Postgres tsvector)

### Declare an index

```ts
// src/operations/products/search.search.ts
import { defineSearchIndex } from "@/aura/server/search";

export default defineSearchIndex("Product", {
  fields: ["name", "description"],
  filterFields: ["categoryId", "status"],
  language: "french",
});
```

### Provision via migration

Generate the SQL and add it to a Prisma migration:

```ts
import { generateSearchIndexSQL } from "@/aura/server/search";
import productSearch from "@/operations/products/search.search";

console.log(generateSearchIndexSQL(productSearch));
// ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
//   GENERATED ALWAYS AS (
//     setweight(to_tsvector('french', coalesce("name", '')), 'A') ||
//     setweight(to_tsvector('french', coalesce("description", '')), 'B')
//   ) STORED;
// CREATE INDEX IF NOT EXISTS "Product_search_idx" ON "Product" USING GIN ("search_vector");
```

Paste into `prisma/migrations/<timestamp>_add_product_search/migration.sql`.

### Search from a handler

```ts
import { search } from "@/aura/server/search";

defineOperationFn("products.search")
  .query()
  .input(z.object({ q: z.string(), categoryId: z.string().optional() }))
  .entities(["Product"])
  .public()
  .handler(async ({ ctx, input }) => {
    const result = await search<Product>("Product", {
      query: input.q,
      filter: { categoryId: input.categoryId },
      limit: 20,
    }, ctx.db);
    return result;     // { items: Product[], scores: number[] }
  });
```

Internally executes:

```sql
SELECT *, ts_rank("search_vector", plainto_tsquery('french', $1)) AS _score
FROM "Product"
WHERE "search_vector" @@ plainto_tsquery('french', $1)
  AND "categoryId" = $2
ORDER BY _score DESC
LIMIT 20
```

`ts_rank` ranks results by relevance. Multi-field weighting via `setweight` (A > B > C > D) means matches in `name` rank higher than matches in `description`.

## Vector search (pgvector)

For semantic search, embeddings, and RAG.

### Declare an index

```ts
// src/operations/documents/embeddings.vector.ts
import { defineVectorIndex } from "@/aura/server/vector";

export default defineVectorIndex("Document", {
  vectorField: "embedding",
  dimensions: 1536,                  // OpenAI text-embedding-3-small
  filterFields: ["workspaceId"],
  indexType: "hnsw",                 // or "ivfflat"
});
```

### Provision via migration

```ts
import { generateVectorIndexSQL } from "@/aura/server/vector";
console.log(generateVectorIndexSQL(documentVector));
// CREATE EXTENSION IF NOT EXISTS vector;
// ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
// CREATE INDEX IF NOT EXISTS "Document_embedding_idx"
//   ON "Document" USING hnsw ("embedding" vector_cosine_ops);
```

### Search

```ts
import { vectorSearch } from "@/aura/server/vector";

defineOperationFn("documents.semantic-search")
  .action()    // actions are recommended for vector search (embedding cost)
  .input(z.object({ query: z.string() }))
  .public()
  .handler(async ({ ctx, input }) => {
    const embedding = await getEmbeddingFromOpenAI(input.query);
    const result = await vectorSearch<Document>("Document", {
      vector: embedding,
      limit: 10,
      filter: { workspaceId: ctx.user.workspaceId },
    }, ctx.db);
    return result;     // { items: Document[], distances: number[] }
  });
```

Distance is cosine distance (lower = more similar). The query throws `BAD_REQUEST` if the vector dimensionality doesn't match the index.

### When to use which

| Use case | Pick |
|----------|------|
| Exact word matches, faceted filters | Full-text |
| Semantic similarity, paraphrase, RAG | Vector |
| Hybrid (RRF-fused) | Both indexes + custom merge |

## Hybrid search

For RAG that combines lexical and semantic relevance, run both queries and fuse with Reciprocal Rank Fusion:

```ts
const [textResults, vectorResults] = await Promise.all([
  search("Document", { query: input.q, limit: 50 }, ctx.db),
  vectorSearch("Document", { vector: await embed(input.q), limit: 50 }, ctx.db),
]);

const fused = rrf([textResults.items, vectorResults.items], { k: 60 }).slice(0, 10);
return { items: fused };
```

(Aura doesn't ship `rrf` — write a 5-liner, it's trivial.)
