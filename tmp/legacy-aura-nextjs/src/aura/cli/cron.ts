import { runAuraCron } from "@/aura/server/cron";

const command = process.argv[2];
const jobName = process.argv[3];

if (command !== "run") {
  console.error("Usage: bun src/aura/cli/cron.ts run <jobName>");
  process.exit(1);
}

if (!jobName) {
  console.error("Missing jobName. Usage: bun src/aura/cli/cron.ts run <jobName>");
  process.exit(1);
}

runAuraCron(jobName)
  .then((result) => {
    if (result.status === "succeeded") {
      console.log(`✓ Cron job "${jobName}" completed in ${result.finishedAt.getTime() - result.startedAt.getTime()}ms`);
      process.exit(0);
    } else {
      console.error(`✗ Cron job "${jobName}" failed: ${result.error}`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error(`✗ Cron runner error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
