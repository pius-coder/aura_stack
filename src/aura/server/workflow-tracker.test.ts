import { describe, it, expect } from "vitest";
import { defineWorkflow, getWorkflow, listWorkflows } from "./workflow";
import { createTrackedPrismaClient } from "./entity-tracker";

describe("workflow", () => {
  it("should register a workflow", () => {
    const wf = defineWorkflow("test.my-workflow")
      .handler(async (_ctx, _input) => {
        return { done: true };
      });

    expect(wf.__auraWorkflow).toBe(true);
    expect(wf.name).toBe("test.my-workflow");
    expect(getWorkflow("test.my-workflow")).toBe(wf);
    expect(listWorkflows().some((w) => w.name === "test.my-workflow")).toBe(true);
  });

  it("should return null for unknown workflow", () => {
    expect(getWorkflow("nonexistent")).toBeNull();
  });
});

describe("entity-tracker", () => {
  it("should track write operations", () => {
    const mockClient = {
      order: {
        findMany: async () => [],
        create: async (_args: unknown) => ({ id: "1" }),
        update: async (_args: unknown) => ({ id: "1" }),
      },
      user: {
        findMany: async () => [],
        findFirst: async () => null,
      },
    };

    const { client, tracker } = createTrackedPrismaClient(mockClient as never);

    (client as never as { order: { create: (a: unknown) => Promise<unknown> } }).order.create({ data: {} });
    (client as never as { user: { findFirst: (a: unknown) => Promise<unknown> } }).user.findFirst({});

    expect(tracker.writes.has("Order")).toBe(true);
    expect(tracker.reads.has("User")).toBe(true);
    expect(tracker.reads.has("Order")).toBe(false);
    expect(tracker.writes.has("User")).toBe(false);
  });

  it("should track read operations", () => {
    const mockClient = {
      product: {
        findMany: async () => [],
        count: async () => 0,
      },
    };

    const { client, tracker } = createTrackedPrismaClient(mockClient as never);

    (client as never as { product: { findMany: (a: unknown) => Promise<unknown> } }).product.findMany({});
    (client as never as { product: { count: (a: unknown) => Promise<unknown> } }).product.count({});

    expect(tracker.reads.has("Product")).toBe(true);
    expect(tracker.writes.has("Product")).toBe(false);
  });

  it("should not track $ methods", () => {
    const mockClient = {
      $queryRaw: async () => [],
      $executeRaw: async () => 0,
    };

    const { client, tracker } = createTrackedPrismaClient(mockClient as never);

    expect((client as never as { $queryRaw: unknown }).$queryRaw).toBeDefined();
    expect(tracker.reads.size).toBe(0);
    expect(tracker.writes.size).toBe(0);
  });
});
