import { defineCronFn } from '@/aura/server/cron';
import { whatsAppGateway } from '@/lib/whatsapp';

export default defineCronFn('whatsapp.process-outbox')
  .schedule('* * * * *')
  .handler(async (ctx) => {
    const pending = await ctx.db.whatsappOutbox.findMany({
      where: { status: 'PENDING', nextRunAt: { lte: new Date() } },
      orderBy: { nextRunAt: 'asc' },
      take: 50,
    });
    const gateway = whatsAppGateway();
    for (const msg of pending) {
      try {
        await ctx.db.whatsappOutbox.update({ where: { id: msg.id }, data: { status: 'SENDING', lockedAt: new Date() } });
        await gateway.sendText(msg.phoneE164, msg.body, msg.idempotencyKey);
        await ctx.db.whatsappOutbox.update({ where: { id: msg.id }, data: { status: 'SUCCEEDED' } });
      } catch (e: any) {
        const attempts = msg.attempts + 1;
        const backoff = Math.min(attempts * attempts * 30000, 3600000);
        await ctx.db.whatsappOutbox.update({
          where: { id: msg.id },
          data: {
            status: attempts >= 6 ? 'FAILED' : 'PENDING',
            attempts,
            error: e?.message?.slice(0, 500),
            nextRunAt: new Date(Date.now() + backoff),
            lockedAt: null,
          },
        });
      }
    }
  });
