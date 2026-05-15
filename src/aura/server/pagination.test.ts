import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, paginate } from "./pagination";

describe("pagination", () => {
  describe("encodeCursor / decodeCursor", () => {
    it("should round-trip a cursor", () => {
      const opHash = "test-op-hash";
      const cursor = encodeCursor({ id: "item-123", operationHash: opHash });
      const decoded = decodeCursor(cursor, opHash);
      expect(decoded.id).toBe("item-123");
    });

    it("should reject a cursor with wrong operation hash", () => {
      const cursor = encodeCursor({ id: "item-123", operationHash: "op-a" });
      expect(() => decodeCursor(cursor, "op-b")).toThrow("opération différente");
    });

    it("should reject a tampered cursor", () => {
      const cursor = encodeCursor({ id: "item-123", operationHash: "op-a" });
      const tampered = cursor.slice(0, -2) + "XX";
      expect(() => decodeCursor(tampered, "op-a")).toThrow();
    });

    it("should reject garbage input", () => {
      expect(() => decodeCursor("not-a-cursor", "op")).toThrow();
    });
  });

  describe("paginate", () => {
    it("should return items and cursor when more exist", async () => {
      const mockModel = {
        findMany: async () => [
          { id: "1", name: "a" },
          { id: "2", name: "b" },
          { id: "3", name: "c" }, // extra item = hasMore
        ],
      };

      const result = await paginate(mockModel, {
        take: 2,
        operationHash: "test",
      });

      expect(result.items).toHaveLength(2);
      expect(result.isDone).toBe(false);
      expect(result.cursor).toBeTruthy();
    });

    it("should return isDone=true when no more items", async () => {
      const mockModel = {
        findMany: async () => [
          { id: "1", name: "a" },
          { id: "2", name: "b" },
        ],
      };

      const result = await paginate(mockModel, {
        take: 5,
        operationHash: "test",
      });

      expect(result.items).toHaveLength(2);
      expect(result.isDone).toBe(true);
      expect(result.cursor).toBeNull();
    });

    it("should return empty result for empty dataset", async () => {
      const mockModel = { findMany: async () => [] };

      const result = await paginate(mockModel, {
        take: 10,
        operationHash: "test",
      });

      expect(result.items).toHaveLength(0);
      expect(result.isDone).toBe(true);
      expect(result.cursor).toBeNull();
    });
  });
});
