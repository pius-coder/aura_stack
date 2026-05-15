import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("auth.vibe-me")
  .query()
  .entities(["AuraUser", "Profile"])
  .auth()
  .handler(async ({ ctx }) => {
    const profile = await ctx.db.profile.findUnique({ where: { userId: ctx.user.id } });
    const phone = await ctx.db.auraPhoneIdentity.findFirst({ where: { userId: ctx.user.id } });
    return {
      user: {
        id: ctx.user.id,
        isAdmin: ctx.user.isAdmin,
        phoneE164: phone?.phoneE164 ?? null,
      },
      profile: profile
        ? {
            displayName: profile.displayName,
            alias: profile.alias,
            language: profile.language,
            isProvider: profile.isProvider,
            isClient: profile.isClient,
            isVerified: profile.isVerified,
            status: profile.status,
            photoFileId: profile.photoFileId,
            bio: profile.bio,
            locationLabel: profile.locationLabel,
          }
        : null,
    };
  });
