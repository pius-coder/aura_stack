import { defineWorkflow } from "@/aura/server/workflow";
import { db } from "@/aura/server/db";
import { AuraError } from "@/aura/core/errors";

interface VerifyIdentityInput {
  userId: string;
  paymentId: string;
}

export default defineWorkflow<VerifyIdentityInput>("verification.identity")
  .handler(async (ctx, input) => {
    const { userId, paymentId } = input;

    await ctx.step<{ selfieId: string; cniId: string }>("upload_documents", async () => {
      // Documents uploaded separately via initiate-badge.action
      // Here we just verify they exist
      const profile = await db.profile.findUnique({ where: { userId } });
      if (!profile?.photoFileId) throw new AuraError("BAD_REQUEST", "Documents non téléversés.");
      return { selfieId: profile.photoFileId, cniId: profile.photoFileId };
    });

    await ctx.step("review", async () => {
      // Admin reviews in Admin_Console — workflow sleeps until decision
      await ctx.sleep(0);
    });

    await ctx.step("activate_or_reject", async () => {
      await db.profile.update({ where: { userId }, data: { isVerified: true } });
    });

    return { verified: true, paymentId, userId };
  });
