import { defineHttpAction } from "@/aura/server/http-action";
import { getPaymentProvider } from "@/lib/payments/factory";

export default defineHttpAction("/webhooks/fapshi", "POST")
  .public()
  .csrf(false)
  .handler(async (ctx, request) => {
    const signature = request.headers.get("x-fapshi-signature") || "";
    const rawBody = await request.text();
    const provider = getPaymentProvider();
    if (!provider.verifyWebhook(rawBody, signature)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const payload = JSON.parse(rawBody);
    const transId = payload?.transId || payload?.providerTransId;
    if (!transId) return new Response("ok", { status: 200 });

    // Idempotent update
    const payment = await ctx.db.payment.findUnique({ where: { providerTransId: transId } });
    if (!payment || payment.status === "SUCCEEDED") return new Response("ok", { status: 200 });

    if (payload.status === "SUCCESSFUL" || payload.status === "succeeded") {
      await ctx.db.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });
      // Activate product
      if (payment.kind === "BADGE") {
        await ctx.db.profile.update({ where: { userId: payment.userId }, data: { isVerified: true, verifiedAt: new Date() } });
      } else if (payment.kind === "BOOST") {
        await ctx.db.boostSlot.create({ data: { userId: payment.userId, endsAt: new Date(Date.now() + 7 * 86400000), paymentId: payment.id } });
      } else if (payment.kind === "PRO") {
        await ctx.db.subscription.create({ data: { userId: payment.userId, plan: "PRO", endsAt: new Date(Date.now() + 30 * 86400000), paymentId: payment.id } });
      }
    }
    return new Response("ok", { status: 200 });
  });
