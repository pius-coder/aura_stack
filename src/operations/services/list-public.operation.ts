import { defineOperationFn } from "@/aura/server/operation";
import { ServiceService } from "@/operations/_services/service-service";

export default defineOperationFn("services.list-public")
  .query()
  .entities(["Service"])
  .public()
  .handler(async ({ ctx }) => {
    const svc = new ServiceService(ctx);
    return svc.listPublic();
  });
