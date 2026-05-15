import { describe, it, expect } from "vitest";
import { defineSearchIndex, getSearchIndex, listSearchIndexes, generateSearchIndexSQL } from "./search";
import { defineVectorIndex, getVectorIndex, listVectorIndexes, generateVectorIndexSQL } from "./vector";

describe("search", () => {
  it("should register a search index", () => {
    const def = defineSearchIndex("TestProduct", {
      fields: ["name", "description"],
      filterFields: ["categoryId"],
      language: "french",
    });

    expect(def.model).toBe("TestProduct");
    expect(def.fields).toEqual(["name", "description"]);
    expect(getSearchIndex("TestProduct")).toBe(def);
    expect(listSearchIndexes().some((d) => d.model === "TestProduct")).toBe(true);
  });

  it("should generate correct SQL for search index", () => {
    const def = defineSearchIndex("TestArticle", {
      fields: ["title", "body"],
      language: "english",
    });

    const sql = generateSearchIndexSQL(def);
    expect(sql).toContain('ALTER TABLE "TestArticle"');
    expect(sql).toContain("search_vector");
    expect(sql).toContain("GIN");
    expect(sql).toContain("to_tsvector('english'");
    expect(sql).toContain('setweight');
  });
});

describe("vector", () => {
  it("should register a vector index", () => {
    const def = defineVectorIndex("TestDocument", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["workspaceId"],
      indexType: "hnsw",
    });

    expect(def.model).toBe("TestDocument");
    expect(def.dimensions).toBe(1536);
    expect(getVectorIndex("TestDocument")).toBe(def);
    expect(listVectorIndexes().some((d) => d.model === "TestDocument")).toBe(true);
  });

  it("should generate correct SQL for vector index", () => {
    const def = defineVectorIndex("TestEmbed", {
      vectorField: "vec",
      dimensions: 768,
      indexType: "ivfflat",
    });

    const sql = generateVectorIndexSQL(def);
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(sql).toContain('vector(768)');
    expect(sql).toContain("ivfflat");
    expect(sql).toContain('"vec"');
  });
});
