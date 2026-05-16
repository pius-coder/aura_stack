import { describe, it, expect } from "vitest";
import { InboxService } from "./inbox-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

describe("InboxService", () => {
  it("extends AuraService", () => {
    const ctx = {} as AuraContext;
    const svc = new InboxService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  it("skips already processed inbox", async () => {
    const ctx = {
      db: { whatsappInbox: { findUnique: async () => ({ id: "i1", processedAt: new Date() }) } },
    } as unknown as AuraContext;
    const svc = new InboxService(ctx);
    const result = await svc.processIncoming("i1");
    expect(result.status).toBe("skipped");
  });

  it("skips missing inbox", async () => {
    const ctx = {
      db: { whatsappInbox: { findUnique: async () => null } },
    } as unknown as AuraContext;
    const svc = new InboxService(ctx);
    const result = await svc.processIncoming("i1");
    expect(result.status).toBe("skipped");
  });
});
