import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ServiceService } from "@/operations/_services/service-service";

export default defineOperationFn("services.update")
  .mutate()
  .input(
    z.object({
      id: z.string(),
      title: z.string().min(1).max(120).optional(),
      description: z.string().max(2000).optional(),
      priceXaf: z.number().int().positive().optional(),
      availability: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE"]).optional(),
      zone: z.string().max(80).optional(),
    }),
  )
  .entities(["Service"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ServiceService(ctx);
    const { id, ...data } = input;
    return svc.update(ctx.user.id, id, data);
  });
