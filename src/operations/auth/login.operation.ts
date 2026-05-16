import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuthService } from "@/operations/_services/auth-service";

export default defineOperationFn("auth.login")
  .mutate()
  .input(z.object({
    countryCode: z.string(),
    phoneNumber: z.string(),
    password: z.string(),
  }))
  .entities(["AuraUser", "AuraSession"])
  .public()
  .handler(async ({ ctx, input }) => {
    const svc = new AuthService(ctx);
    await svc.login(input);
    return { ok: true };
  });
