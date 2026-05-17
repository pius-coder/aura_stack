import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ServiceService } from "@/operations/_services/service-service";

export default defineOperationFn("services.deactivate")
  .mutate()
  .input(z.object({ id: z.string() }))
  .entities(["Service"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ServiceService(ctx);
    return svc.deactivate(ctx.user.id, input.id);
  });
