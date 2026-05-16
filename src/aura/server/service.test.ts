import { describe, it, expect, vi } from "vitest";
import { AuraService } from "./service";
import type { AuraContext } from "./context";

function mockCtx(overrides: Partial<AuraContext> = {}): AuraContext {
  return {
    db: {} as any,
    user: { id: "user-1" } as any,
    session: { id: "sess-1" } as any,
    agent: {} as any,
    scheduler: {} as any,
    storage: {} as any,
    log: {} as any,
    audit: {} as any,
    notify: { via: vi.fn().mockReturnValue({ send: vi.fn() }) } as any,
    bump: {} as any,
    requestId: "req-1",
    source: "bridge" as const,
    auth: {} as any,
    runQuery: vi.fn(),
    runMutation: vi.fn(),
    runAction: vi.fn(),
    invalidate: vi.fn(),
    paginate: vi.fn(),
    ...overrides,
  } as unknown as AuraContext;
}

describe("AuraService", () => {
  it("exposes db from context", () => {
    const ctx = mockCtx();
    const svc = new AuraService(ctx);
    expect(svc.db).toBe(ctx.db);
  });

  it("exposes user from context", () => {
    const ctx = mockCtx();
    const svc = new AuraService(ctx);
    expect(svc.user).toBe(ctx.user);
  });

  it("exposes session from context", () => {
    const ctx = mockCtx();
    const svc = new AuraService(ctx);
    expect(svc.session).toBe(ctx.session);
  });

  it("exposes agent, scheduler, storage", () => {
    const ctx = mockCtx();
    const svc = new AuraService(ctx);
    expect(svc.agent).toBe(ctx.agent);
    expect(svc.scheduler).toBe(ctx.scheduler);
    expect(svc.storage).toBe(ctx.storage);
  });

  it("runQuery delegates to context", () => {
    const ctx = mockCtx();
    const svc = new AuraService(ctx);
    svc.runQuery("test.query", { id: "1" });
    expect(ctx.runQuery).toHaveBeenCalledWith("test.query", { id: "1" });
  });

  it("runMutation delegates to context", () => {
    const ctx = mockCtx();
    const svc = new AuraService(ctx);
    svc.runMutation("test.mutate", { id: "1" });
    expect(ctx.runMutation).toHaveBeenCalledWith("test.mutate", { id: "1" });
  });

  it("invalidate delegates to context", () => {
    const ctx = mockCtx();
    const svc = new AuraService(ctx);
    svc.invalidate({ entity: "Test", id: "t1" });
    expect(ctx.invalidate).toHaveBeenCalledWith({ entity: "Test", id: "t1" });
  });

  it("notify delegates to context", () => {
    const ctx = mockCtx();
    const svc = new AuraService(ctx);
    expect(svc.notify).toBe(ctx.notify);
  });

  it("supports subclassing", () => {
    class TestService extends AuraService {
      getUserName() { return this.user?.id ?? "unknown"; }
    }
    const ctx = mockCtx();
    const svc = new TestService(ctx);
    expect(svc.getUserName()).toBe("user-1");
  });

  it("supports composition", () => {
    class InnerService extends AuraService {
      getUserId() { return this.user?.id; }
    }
    class OuterService extends AuraService {
      constructor(ctx: AuraContext, public inner: InnerService) { super(ctx); }
    }
    const ctx = mockCtx();
    const inner = new InnerService(ctx);
    const outer = new OuterService(ctx, inner);
    expect(outer.inner.getUserId()).toBe("user-1");
  });
});
