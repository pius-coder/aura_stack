import { defineCronFn } from "@/aura/server/cron";

export default defineCronFn("graph.refresh-views")
  .schedule("0 */6 * * *")
  .handler(async () => {
    // TODO: refresh materialized views for graph traversal performance
  });
