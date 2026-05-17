import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("graph.search-vector")
  .action()
  .input(z.object({
    query: z.string(),
    requesterId: z.string(),
    region: z.string().optional(),
    topK: z.number().int().max(50).default(50),
  }))
  .internal()
  .handler(async () => {
    // TODO: execute pgvector cosine search when pgvector is available
    return { results: [], query: "" };
  });
