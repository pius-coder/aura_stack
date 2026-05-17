import { defineOperationFn } from "@/aura/server/operation";
import { ProfileService } from "@/operations/_services/profile-service";

export default defineOperationFn("profiles.get")
  .query()
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx }) => {
    const svc = new ProfileService(ctx);
    return svc.getProfile(ctx.user.id);
  });
