

import { db } from "./db";
import { createAuraContext } from "./create-context";

const OUTBOX_LOCK_SECONDS = 60;
const OUTBOX_BATCH_SIZE = 100;

export async function processOutboxEvents(batchSize = OUTBOX_BATCH_SIZE): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() - OUTBOX_LOCK_SECONDS * 1000);

  const events = await db.auraOutboxEvent.findMany({
    where: {
      status: "PENDING",
      nextRunAt: { lte: now },
      OR: [
        { lockedAt: null },
        { lockedAt: { lte: lockExpiresAt } },
      ],
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  let succeeded = 0;
  let failed = 0;

  for (const event of events) {
    await db.auraOutboxEvent.update({
      where: { id: event.id },
      data: {
        lockedAt: now,
        status: "PROCESSING",
      },
    });

    try {
      const ctx = await createAuraContext({
        source: "internal",
        requestId: `outbox_${event.id}`,
      });

      ctx.log.info("Processing outbox event", {
        eventId: event.id,
        type: event.type,
        attempts: event.attempts,
      });

      // Outbox events are dispatched to notification handlers by convention.
      // The event type maps to a notification name.
      const { createNotificationDispatcher } = await import("./notifications");
      const dispatcher = createNotificationDispatcher(() => ctx);
      await dispatcher.via(event.type).send(event.payload);

      await db.auraOutboxEvent.update({
        where: { id: event.id },
        data: {
          status: "SUCCEEDED",
          processedAt: new Date(),
          lockedAt: null,
        },
      });

      succeeded++;
    } catch (error) {
      const attempts = event.attempts + 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const backoffMinutes = Math.min(2 ** attempts, 60);
      const nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

      await db.auraOutboxEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= event.maxAttempts ? "FAILED" : "PENDING",
          attempts,
          error: errorMessage,
          nextRunAt,
          lockedAt: null,
        },
      });

      failed++;
    }
  }

  return {
    processed: events.length,
    succeeded,
    failed,
  };
}
