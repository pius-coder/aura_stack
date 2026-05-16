import { describe, it, expect } from "vitest";
import { AliasService } from "./alias-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

describe("AliasService", () => {
  it("extends AuraService", () => {
    const ctx = {} as AuraContext;
    const svc = new AliasService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  it("returns a unique alias with three parts", async () => {
    const ctx = {
      db: { profile: { findUnique: async () => null } },
    } as unknown as AuraContext;
    const svc = new AliasService(ctx);
    const alias = await svc.generateUnique("FR");
    const parts = alias.split("-");
    expect(parts).toHaveLength(3);
    expect(parts[2]).toMatch(/^\d{4}$/);
  });

  it("retries on collision", async () => {
    let callCount = 0;
    const ctx = {
      db: {
        profile: {
          findUnique: async () => {
            callCount++;
            return callCount < 3 ? { alias: "collision" } : null;
          },
        },
      },
    } as unknown as AuraContext;
    const svc = new AliasService(ctx);
    const alias = await svc.generateUnique("FR");
    expect(alias.split("-")).toHaveLength(3);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });
});
