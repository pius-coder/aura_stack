import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { revokeCurrentSession } from "@/aura/server/auth/session";

export default defineOperationFn("auth.vibe-logout")
  .mutate()
  .input(z.object({}))
  .entities(["AuraSession"])
  .auth()
  .handler(async ({ ctx }) => {
    await revokeCurrentSession(ctx);
    return { ok: true };
  });
