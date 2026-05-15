

import { AuraOtpPurpose } from "@/generated/prisma/enums";
import type { AuraDb } from "../db";
import { hashOtpCode, randomNumericCode, randomToken } from "../crypto";
import { AuraError } from "@/aura/core/errors";
import { toPrismaJson } from "../json";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

export type AuraOtpPurposeValue =
  (typeof AuraOtpPurpose)[keyof typeof AuraOtpPurpose];

export function publicOtpPurpose(
  purpose: AuraOtpPurposeValue,
):
  | "register_phone"
  | "login_phone"
  | "reset_password"
  | "change_phone"
  | "sensitive_action" {
  switch (purpose) {
    case AuraOtpPurpose.REGISTER_PHONE:
      return "register_phone";
    case AuraOtpPurpose.LOGIN_PHONE:
      return "login_phone";
    case AuraOtpPurpose.RESET_PASSWORD:
      return "reset_password";
    case AuraOtpPurpose.CHANGE_PHONE:
      return "change_phone";
    case AuraOtpPurpose.SENSITIVE_ACTION:
      return "sensitive_action";
  }
}

export async function createOtpChallenge(args: {
  db: AuraDb;
  phoneE164: string;
  purpose: AuraOtpPurposeValue;
  userId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ challengeId: string; code: string; expiresAt: Date }> {
  const challengeId = `otp_${randomToken(18)}`;
  const code = randomNumericCode(8);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await args.db.auraOtpChallenge.updateMany({
    where: {
      phoneE164: args.phoneE164,
      purpose: args.purpose,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  await args.db.auraOtpChallenge.create({
    data: {
      id: challengeId,
      userId: args.userId ?? null,
      phoneE164: args.phoneE164,
      purpose: args.purpose,
      codeHash: hashOtpCode({
        challengeId,
        phoneE164: args.phoneE164,
        purpose: args.purpose,
        code,
      }),
      expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
      metadata: toPrismaJson(args.metadata),
    },
  });

  return { challengeId, code, expiresAt };
}

export async function consumeOtpChallenge(args: {
  db: AuraDb;
  challengeId: string;
  code: string;
  purpose: AuraOtpPurposeValue;
}): Promise<{ userId: string | null; phoneE164: string }> {
  return args.db.$transaction(async (tx) => {
    const challenge = await tx.auraOtpChallenge.findUnique({
      where: { id: args.challengeId },
    });

    if (
      !challenge ||
      challenge.purpose !== args.purpose ||
      challenge.consumedAt
    ) {
      throw new AuraError("OTP_INVALID", "Code de vérification invalide.");
    }

    if (challenge.expiresAt <= new Date()) {
      await tx.auraOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new AuraError("OTP_EXPIRED", "Le code de vérification a expiré.");
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new AuraError("RATE_LIMITED", "Trop de tentatives pour ce code.");
    }

    const expectedHash = hashOtpCode({
      challengeId: challenge.id,
      phoneE164: challenge.phoneE164,
      purpose: challenge.purpose,
      code: args.code.trim(),
    });

    if (expectedHash !== challenge.codeHash) {
      await tx.auraOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AuraError("OTP_INVALID", "Code de vérification invalide.");
    }

    await tx.auraOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: { increment: 1 },
        consumedAt: new Date(),
      },
    });

    return {
      userId: challenge.userId,
      phoneE164: challenge.phoneE164,
    };
  });
}
