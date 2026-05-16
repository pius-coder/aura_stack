import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import type { Profile } from "@/generated/prisma";

export class ProfileService extends AuraService {
  async getProfile(userId: string) {
    const profile = await this.db.profile.findUnique({ where: { userId } });
    if (!profile) return null;

    const [serviceCount, ratingAgg] = await Promise.all([
      this.db.service.count({ where: { userId, deletedAt: null, isActive: true } }),
      this.db.rating.aggregate({ where: { rateeId: userId }, _avg: { score: true }, _count: true }),
    ]);

    return { ...profile, serviceCount, ratingAvg: ratingAgg._avg.score, ratingCount: ratingAgg._count };
  }

  async getByAlias(alias: string) {
    const profile = await this.db.profile.findFirst({ where: { alias } });
    if (!profile) throw new AuraError("NOT_FOUND", "Profil introuvable.");

    const services = await this.db.service.findMany({
      where: { userId: profile.userId, isActive: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return {
      alias: profile.alias,
      bio: profile.bio,
      locationLabel: profile.locationLabel,
      language: profile.language,
      isVerified: profile.isVerified,
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      services,
    };
  }

  async updateProfile(userId: string, data: { displayName?: string; bio?: string; locationLabel?: string }) {
    if (data.displayName && data.displayName.length > 80) {
      throw new AuraError("VALIDATION_ERROR", "Le nom ne peut pas dépasser 80 caractères.");
    }
    if (data.bio && data.bio.length > 1000) {
      throw new AuraError("VALIDATION_ERROR", "La bio ne peut pas dépasser 1000 caractères.");
    }

    const profile = await this.db.profile.update({ where: { userId }, data });
    this.scheduler?.runAfter(5000, "embeddings.regenerate" as any, { userId })?.catch?.(() => {});
    return profile;
  }

  async setType(userId: string, type: "standard" | "prestataire") {
    const profile = await this.db.profile.findUnique({ where: { userId } });
    if (!profile) throw new AuraError("NOT_FOUND", "Profil introuvable.");

    // Can't convert from prestataire to standard if active services exist
    if (type === "standard" && profile.isProvider) {
      const activeServices = await this.db.service.count({
        where: { userId, isActive: true, deletedAt: null },
      });
      if (activeServices > 0) {
        throw new AuraError("BAD_REQUEST", "Vous avez des services actifs. Supprimez-les d'abord.");
      }
    }

    return this.db.profile.update({
      where: { userId },
      data: {
        isProvider: type === "prestataire",
        isClient: true,
      },
    });
  }

  async setLanguage(userId: string, language: "FR" | "EN") {
    return this.db.profile.update({ where: { userId }, data: { language } });
  }

  async canMatch(userId: string): Promise<{ eligible: boolean; reason?: string }> {
    const profile = await this.db.profile.findUnique({ where: { userId } });
    if (!profile) return { eligible: false, reason: "PROFILE_NOT_FOUND" };
    if (profile.status !== "ACTIVE") return { eligible: false, reason: "PROFILE_SUSPENDED" };
    if (!profile.displayName || !profile.locationLabel) {
      return { eligible: false, reason: "INCOMPLETE_PROFILE" };
    }
    return { eligible: true };
  }

  async canUploadPhoto(mimeType: string, size: number): Promise<boolean> {
    const allowed = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
    if (!allowed.includes(mimeType)) return false;
    if (size > 5 * 1024 * 1024) return false;
    return true;
  }

  async uploadPhoto(userId: string, file: File): Promise<string> {
    if (!(await this.canUploadPhoto(file.type, file.size))) {
      throw new AuraError("VALIDATION_ERROR", "Format ou taille invalide. Formats acceptés: png, jpg, jpeg, webp (max 5 Mo).");
    }

    const stored = await this.storage.store(file, { path: `profiles/${userId}/photo` });
    await this.db.profile.update({ where: { userId }, data: { photoFileId: stored.id } });

    return stored.id;
  }
}
