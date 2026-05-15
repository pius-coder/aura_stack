import { describe, it, expect } from "vitest";
import { deriveNameFromPath, detectArtifactType, validateNameMatch } from "./discovery";

describe("discovery", () => {
  describe("deriveNameFromPath", () => {
    it("should derive name from simple path", () => {
      expect(deriveNameFromPath("catalog/product-by-slug.operation.ts")).toBe("catalog.product-by-slug");
    });

    it("should handle nested namespaces", () => {
      expect(deriveNameFromPath("admin/users/ban.operation.ts")).toBe("admin.users.ban");
    });

    it("should handle cron suffix", () => {
      expect(deriveNameFromPath("catalog/refresh-views.cron.ts")).toBe("catalog.refresh-views");
    });

    it("should handle workflow suffix", () => {
      expect(deriveNameFromPath("orders/fulfill.workflow.ts")).toBe("orders.fulfill");
    });

    it("should handle top-level files", () => {
      expect(deriveNameFromPath("health.operation.ts")).toBe("health");
    });
  });

  describe("detectArtifactType", () => {
    it("should detect operation files", () => {
      expect(detectArtifactType("product-by-slug.operation.ts")).toBe("operation");
    });

    it("should detect middleware files", () => {
      expect(detectArtifactType("with-auth.middleware.ts")).toBe("middleware");
    });

    it("should detect cron files", () => {
      expect(detectArtifactType("refresh.cron.ts")).toBe("cron");
    });

    it("should detect workflow files", () => {
      expect(detectArtifactType("fulfill.workflow.ts")).toBe("workflow");
    });

    it("should detect agent files", () => {
      expect(detectArtifactType("support.agent.ts")).toBe("agent");
    });

    it("should detect http files", () => {
      expect(detectArtifactType("stripe.http.ts")).toBe("http");
    });

    it("should detect search files", () => {
      expect(detectArtifactType("product.search.ts")).toBe("search");
    });

    it("should detect vector files", () => {
      expect(detectArtifactType("document.vector.ts")).toBe("vector");
    });

    it("should detect db-read files", () => {
      expect(detectArtifactType("summary.db-read.ts")).toBe("db-read");
    });

    it("should return null for unknown files", () => {
      expect(detectArtifactType("utils.ts")).toBeNull();
      expect(detectArtifactType("index.ts")).toBeNull();
    });
  });

  describe("validateNameMatch", () => {
    it("should validate matching names", () => {
      expect(validateNameMatch("catalog.product-by-slug", "catalog.product-by-slug")).toBe(true);
    });

    it("should reject mismatched names", () => {
      expect(validateNameMatch("catalog.productBySlug", "catalog.product-by-slug")).toBe(false);
    });
  });
});
