import { defineOperationFn } from "@/aura/server/operation";
import { revokeCurrentSession } from "@/aura/server/auth/session";

export default defineOperationFn("auth.vibe-logout")
  .mutate()
  .entities(["AuraSession"])
  .auth()
  .handler(async ({ ctx }) => {
    await revokeCurrentSession(ctx);
    return { ok: true };
  });
