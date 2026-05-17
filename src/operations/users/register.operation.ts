import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuthService } from "@/operations/_services/auth-service";

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Numéro E.164 invalide");

export default defineOperationFn("users.register")
  .mutate()
  .input(z.object({
    phoneE164: phoneSchema,
    email: z.string().email("Email invalide.").optional().or(z.literal("")),
    password: z.string().min(12, "Minimum 12 caractères."),
    displayName: z.string().max(80).optional(),
    consent: z.object({
      privacy: z.literal(true, { errorMap: () => ({ message: "Consentement requis." }) }),
      dataProcessing: z.literal(true, { errorMap: () => ({ message: "Consentement requis." }) }),
      whatsappComms: z.literal(true, { errorMap: () => ({ message: "Consentement requis." }) }),
    }),
  }))
  .entities(["AuraUser", "Profile", "AuraSession"])
  .public()
  .handler(async ({ ctx, input }) => {
    const svc = new AuthService(ctx);
    return svc.register({
      phoneE164: input.phoneE164,
      email: input.email || undefined,
      password: input.password,
      displayName: input.displayName,
      consent: input.consent,
    });
  });
