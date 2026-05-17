import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";
import { DisputeService } from "@/operations/_services/dispute-service";

export default defineOperationFn("disputes.resolve")
  .mutate()
  .input(z.object({
    disputeId: z.string(),
    decision: z.enum(["DISMISS", "WARN_REPORTER", "WARN_REPORTED", "WARN_BOTH", "SUSPEND_REPORTED", "SUSPEND_BOTH"]),
    internalNote: z.string().optional(),
  }))
  .entities(["Dispute", "Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    if (!ctx.user.isAdmin) throw new AuraError("FORBIDDEN", "Accès admin requis.");
    const svc = new DisputeService(ctx);
    return svc.resolve(input.disputeId, ctx.user.id, input.decision, input.internalNote);
  });
