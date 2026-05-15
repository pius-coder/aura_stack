import { defineHttpAction } from '@/aura/server/http-action';

export default defineHttpAction('/webhooks/whatsapp', 'POST')
  .public()
  .csrf(false)
  .handler(async (ctx, request) => {
    const url = new URL(request.url);
    const secret = url.searchParams.get('secret');
    if (secret !== process.env.WHATSAPP_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    const payload = await request.json();
    const msgId = payload?.data?.key?.id || payload?.instance || crypto.randomUUID();
    
    // Idempotent insert
    const existing = await ctx.db.whatsappInbox.findUnique({ where: { providerMessageId: msgId } });
    if (!existing) {
      await ctx.db.whatsappInbox.create({
        data: {
          providerMessageId: msgId,
          phoneE164: payload?.data?.key?.remoteJid?.replace('@s.whatsapp.net','')?.replace(/[^+\d]/g,'') || '',
          direction: 'IN',
          payload: payload,
        },
      });
    }
    return new Response('ok', { status: 200 });
  });
