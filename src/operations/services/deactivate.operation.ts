import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ServiceService } from "@/operations/_services/service-service";

export default defineOperationFn("services.toggle")
  .mutate()
  .input(z.object({ id: z.string() }))
  .entities(["Service"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ServiceService(ctx);
    return svc.toggle(ctx.user.id, input.id);
  });
