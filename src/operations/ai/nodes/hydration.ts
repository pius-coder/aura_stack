import { db } from "@/aura/server/db";

export async function hydrateUserContext(userId: string) {
  const profile = await db.profile.findUnique({ where: { userId } });
  if (!profile || profile.status === "SUSPENDED") return null;
  const services = await db.service.findMany({ where: { userId, isActive: true, deletedAt: null }, take: 10 });
  return { profile, services };
}
