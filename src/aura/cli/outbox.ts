import { processOutboxEvents } from "@/aura/server/outbox";

const batchSize = Number.parseInt(process.argv[3] || "100", 10);

processOutboxEvents(Number.isFinite(batchSize) ? batchSize : 100)
  .then((result) => {
    console.log(
      `Outbox processed: ${result.processed} events (${result.succeeded} succeeded, ${result.failed} failed)`,
    );
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(
      `Outbox processor error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
