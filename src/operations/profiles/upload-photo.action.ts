import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ProfileService } from "@/operations/_services/profile-service";

export default defineOperationFn("profiles.upload-photo")
  .mutate()
  .input(z.object({ file: z.instanceof(File) }))
  .entities(["Profile", "AuraStoredFile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ProfileService(ctx);
    const storedId = await svc.uploadPhoto(ctx.user.id, input.file);
    return { fileId: storedId, url: ctx.storage.getUrl(storedId) };
  });
