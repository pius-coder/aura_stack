import type { PrismaClient } from '@/generated/prisma/client';

export async function resolveUserByPhone(db: PrismaClient, phoneE164: string): Promise<string | null> {
  const identity = await db.auraPhoneIdentity.findUnique({ where: { phoneE164 } });
  return identity?.userId ?? null;
}
