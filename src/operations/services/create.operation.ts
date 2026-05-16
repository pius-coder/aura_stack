import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ServiceService } from "@/operations/_services/service-service";

export default defineOperationFn("services.create")
  .mutate()
  .input(
    z.object({
      title: z.string().min(1).max(120),
      description: z.string().min(1).max(2000),
      priceXaf: z.number().int().positive(),
      availability: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE"]).default("AVAILABLE"),
      zone: z.string().max(80).optional(),
    }),
  )
  .entities(["Service", "Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ServiceService(ctx);
    return svc.create(ctx.user.id, input);
  });
