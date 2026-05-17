import type { PrismaClient } from '@/generated/prisma/client';

export async function resolveUserByPhone(db: PrismaClient, phoneE164: string): Promise<string | null> {
  const exact = await db.auraPhoneIdentity.findUnique({ where: { phoneE164 } });
  if (exact) return exact.userId;

  const normalized = phoneE164.startsWith("+") ? phoneE164 : `+${phoneE164.replace(/[^\d]/g, "")}`;
  if (normalized === phoneE164) return null;

  const fallback = await db.auraPhoneIdentity.findUnique({ where: { phoneE164: normalized } });
  return fallback?.userId ?? null;
}
