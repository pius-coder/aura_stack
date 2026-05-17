import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("users.verify-email")
  .mutate()
  .input(z.object({ token: z.string() }))
  .entities(["AuraUser"])
  .public()
  .handler(async () => {
    // TODO: implement email verification when email delivery is set up
    return { ok: true };
  });
