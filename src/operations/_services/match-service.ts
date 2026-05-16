import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";

export class MatchService extends AuraService {
  async create(requesterId: string, targetUserId: string, originSessionId?: string) {
    if (targetUserId === requesterId) {
      throw new AuraError("BAD_REQUEST", "Impossible de vous matcher vous-même.");
    }

    const existing = await this.db.match.findFirst({
      where: {
        requesterId,
        targetId: targetUserId,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
    });
    if (existing) throw new AuraError("BAD_REQUEST", "Une demande existe déjà.");

    const match = await this.db.match.create({
      data: { requesterId, targetId: targetUserId, originSessionId },
    });

    const target = await this.db.auraUser.findUnique({
      where: { id: targetUserId },
      select: { whatsappE164: true, profile: { select: { language: true } } },
    });
    if (target?.whatsappE164) {
      const lang = target.profile?.language ?? "FR";
      this.notify.via("match-request").send({ phoneE164: target.whatsappE164, language: lang }).catch(() => {});
    }

    return match;
  }

  async accept(userId: string, matchId: string) {
    const match = await this.db.match.findUnique({ where: { id: matchId } });
    if (!match || match.targetId !== userId) throw new AuraError("NOT_FOUND", "Match introuvable.");
    if (match.status !== "PENDING") throw new AuraError("BAD_REQUEST", "Ce match n'est plus en attente.");

    await this.db.match.update({ where: { id: matchId }, data: { status: "ACCEPTED" } });
    const [userA, userB] = [match.requesterId, match.targetId].sort();
    await this.db.conversation.create({ data: { userAId: userA, userBId: userB, matchId: match.id } });

    const requester = await this.db.auraUser.findUnique({
      where: { id: match.requesterId },
      select: { whatsappE164: true, profile: { select: { language: true } } },
    });
    if (requester?.whatsappE164) {
      const lang = requester.profile?.language ?? "FR";
      this.notify.via("match-accepted").send({ phoneE164: requester.whatsappE164, language: lang }).catch(() => {});
    }

    return { ok: true };
  }

  async refuse(userId: string, matchId: string) {
    const match = await this.db.match.findUnique({ where: { id: matchId } });
    if (!match || match.targetId !== userId) throw new AuraError("NOT_FOUND", "Match introuvable.");
    if (match.status !== "PENDING") throw new AuraError("BAD_REQUEST", "Ce match n'est plus en attente.");

    await this.db.match.update({ where: { id: matchId }, data: { status: "REFUSED" } });

    const requester = await this.db.auraUser.findUnique({
      where: { id: match.requesterId },
      select: { whatsappE164: true, profile: { select: { language: true } } },
    });
    if (requester?.whatsappE164) {
      const lang = requester.profile?.language ?? "FR";
      this.notify.via("match-refused").send({ phoneE164: requester.whatsappE164, language: lang }).catch(() => {});
    }

    return { ok: true };
  }

  async cancel(userId: string, matchId: string) {
    const match = await this.db.match.findUnique({ where: { id: matchId } });
    if (!match || match.requesterId !== userId) throw new AuraError("NOT_FOUND", "Match introuvable.");
    if (match.status !== "PENDING") throw new AuraError("BAD_REQUEST", "Seuls les matchs en attente peuvent être annulés.");

    return this.db.match.update({ where: { id: matchId }, data: { status: "CANCELLED" } });
  }

  async listIncoming(userId: string) {
    return this.db.match.findMany({
      where: { targetId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { requester: { select: { alias: true, bio: true, locationLabel: true } } },
    });
  }

  async listOutgoing(userId: string) {
    return this.db.match.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { target: { select: { alias: true, bio: true, locationLabel: true } } },
    });
  }

  async expirePending() {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const result = await this.db.match.updateMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      data: { status: "EXPIRED" },
    });
    return { expired: result.count };
  }
}
