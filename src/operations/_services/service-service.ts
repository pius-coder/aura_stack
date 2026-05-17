import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import { api } from "@/aura/_generated/api";

const MAX_SERVICES_FREE_TIER = 50;

export class ServiceService extends AuraService {
  async create(userId: string, input: {
    title: string;
    description: string;
    priceXaf: number;
    availability?: "AVAILABLE" | "BUSY" | "UNAVAILABLE";
    zone?: string;
  }) {
    const count = await this.db.service.count({
      where: { userId, deletedAt: null, isActive: true },
    });
    if (count >= MAX_SERVICES_FREE_TIER) {
      const pro = await this.db.subscription.findFirst({
        where: { userId, plan: "PRO", status: "ACTIVE", endsAt: { gt: new Date() } },
      });
      if (!pro) {
        throw new AuraError("BAD_REQUEST", `Limite de ${MAX_SERVICES_FREE_TIER} services atteinte. Abonnez-vous à Pro pour plus.`);
      }
    }

    const service = await this.db.service.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        priceXaf: input.priceXaf,
        availability: input.availability ?? "AVAILABLE",
        zone: input.zone,
      },
    });

    const profile = await this.db.profile.findUnique({ where: { userId } });
    if (profile && !profile.isProvider) {
      await this.db.profile.update({ where: { userId }, data: { isProvider: true } });
    }

    this.scheduler.runAfter(0, api.graph["upsert-entity"], { userId, type: "SERVICE", value: input.title, source: "DASHBOARD" }).catch(() => {});
    return service;
  }

  async update(userId: string, id: string, input: Partial<{
    title: string;
    description: string;
    priceXaf: number;
    availability: "AVAILABLE" | "BUSY" | "UNAVAILABLE";
    zone: string;
    isActive: boolean;
  }>) {
    const svc = await this.db.service.findUnique({ where: { id } });
    if (!svc || svc.userId !== userId) throw new AuraError("NOT_FOUND", "Service introuvable.");

    const result = await this.db.service.update({ where: { id }, data: input });
    this.scheduler.runAfter(0, api.graph["upsert-entity"], { userId, type: "SERVICE", value: result.title, source: "DASHBOARD" }).catch(() => {});
    return result;
  }

  async deactivate(userId: string, id: string) {
    const svc = await this.db.service.findUnique({ where: { id } });
    if (!svc || svc.userId !== userId) throw new AuraError("NOT_FOUND", "Service introuvable.");
    if (!svc.isActive) return svc;

    return this.db.service.update({ where: { id }, data: { isActive: false } });
  }

  async delete(userId: string, id: string) {
    const svc = await this.db.service.findUnique({ where: { id } });
    if (!svc || svc.userId !== userId) throw new AuraError("NOT_FOUND", "Service introuvable.");

    await this.db.service.update({ where: { id }, data: { deletedAt: new Date() } });
    this.scheduler.runAfter(0, api.graph["upsert-entity"], { userId, type: "SERVICE", value: svc.title, source: "DASHBOARD" }).catch(() => {});
    return { ok: true };
  }

  async listMine(userId: string) {
    return this.db.service.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async listPublic() {
    return this.db.service.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
