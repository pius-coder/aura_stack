import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("system.health")
  .query()
  .public()
  .handler(async () => {
    return { ok: true, ts: Date.now() };
  });
