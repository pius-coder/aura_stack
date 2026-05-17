import { defineWorkflow } from "@/aura/server/workflow";
import { db } from "@/aura/server/db";

interface EscrowInput {
  missionId: string;
  clientId: string;
  providerId: string;
  amountXaf: number;
  commissionRate: number;
}

export default defineWorkflow<EscrowInput>("escrow.lifecycle")
  .handler(async (ctx, input) => {
    const { clientId, providerId, amountXaf, commissionRate } = input;
    const commission = Math.round(amountXaf * commissionRate / 100);
    const totalAmount = amountXaf + commission;

    const heldPayment = await ctx.step("hold_funds", async () => {
      return db.payment.create({
        data: {
          userId: clientId,
          provider: "escrow",
          kind: "COMMISSION",
          amountXaf: totalAmount,
          status: "PENDING",
          metadata: { missionId: input.missionId, providerId, commission },
        },
      });
    });

    await ctx.step("await_delivery_confirmation", async () => {
      await ctx.sleep(0);
    });

    await ctx.step("release_funds", async () => {
      await db.payment.update({
        where: { id: heldPayment.id },
        data: { status: "SUCCEEDED" },
      });
    });

    return { released: true, paymentId: heldPayment.id, providerId, amountXaf, commission };
  });
