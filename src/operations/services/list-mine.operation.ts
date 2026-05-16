import { defineOperationFn } from "@/aura/server/operation";
import { ServiceService } from "@/operations/_services/service-service";

export default defineOperationFn("services.list-mine")
  .query()
  .entities(["Service"])
  .auth()
  .handler(async ({ ctx }) => {
    const svc = new ServiceService(ctx);
    return svc.listMine(ctx.user.id);
  });
