import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("disputes.list-pending")
  .query()
  .input(z.object({ status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED"]).optional() }))
  .entities(["Dispute"])
  .auth()
  .handler(async ({ ctx, input }) => {
    if (!ctx.user.isAdmin) throw new AuraError("FORBIDDEN", "Admin requis.");
    return ctx.db.dispute.findMany({
      where: input.status ? { status: input.status } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { conversation: true, reporter: { select: { alias: true } } },
    });
  });
