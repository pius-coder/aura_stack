

import { AuraOtpPurpose } from "@/generated/prisma/enums";
import { AuraError } from "@/aura/core/errors";
import { defineOperationFn } from "../operation";
import { enforceRateLimit } from "../rate-limit";
import { normalizePhone } from "./phone";
import { hashPassword, verifyPassword } from "./password";
import {
  createOtpChallenge,
  consumeOtpChallenge,
  publicOtpPurpose,
} from "./otp";
import {
  createSession,
  revokeAllUserSessions,
  revokeCurrentSession,
} from "./session";
import {
  authLoginInputSchema,
  authRegisterInputSchema,
  authRequestPasswordResetInputSchema,
  authResetPasswordInputSchema,
  authVerifyOtpInputSchema,
} from "@/aura/shared/auth-schemas";
import type {
  AuthChallengeResult,
  AuthSessionListResult,
  AuthSessionResult,
  AuthUserSafe,
} from "@/aura/shared/auth-types";
import "./notifications";

function rateLimitKey(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(":");
}

function userSafe(args: {
  id: string;
  phoneE164: string;
  phoneVerifiedAt: Date | null;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
}): AuthUserSafe {
  return {
    id: args.id,
    phoneE164: args.phoneE164,
    phoneVerifiedAt: args.phoneVerifiedAt?.toISOString() ?? null,
    displayName: args.displayName,
    email: args.email,
    isAdmin: args.isAdmin,
  };
}

async function createAndSendOtp(args: {
  ctx: import("../context").AuraContext;
  phoneE164: string;
  purpose: (typeof AuraOtpPurpose)[keyof typeof AuraOtpPurpose];
  userId?: string;
}): Promise<AuthChallengeResult> {
  const challenge = await createOtpChallenge({
    db: args.ctx.db,
    phoneE164: args.phoneE164,
    purpose: args.purpose,
    userId: args.userId,
  });

  await args.ctx.notify.via("auth.phoneOtp").send({
    phoneE164: args.phoneE164,
    code: challenge.code,
    purpose: publicOtpPurpose(args.purpose),
    expiresAt: challenge.expiresAt.toISOString(),
  });

  await args.ctx.db.auraOtpChallenge.update({
    where: { id: challenge.challengeId },
    data: { sentAt: new Date() },
  });

  return {
    challengeId: challenge.challengeId,
    phoneE164: args.phoneE164,
    expiresAt: challenge.expiresAt.toISOString(),
  };
}

export const authRegister = defineOperationFn("auth.register")
  .mutate()
  .input(authRegisterInputSchema)
  .entities([
    "AuraUser",
    "AuraPhoneIdentity",
    "AuraPasswordCredential",
    "AuraSession",
  ])
  .public()
  .handler<AuthSessionResult>(async ({ ctx, input }) => {
    const phone = normalizePhone({
      countryCode: input.countryCode,
      phoneNumber: input.phoneNumber,
    });
    await enforceRateLimit(ctx.db, {
      key: rateLimitKey(["auth", "register", ctx.request.ip, phone.phoneE164]),
      limit: 5,
      windowSeconds: 60 * 15,
    });

    const existingPhone = await ctx.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: phone.phoneE164 },
    });

    if (existingPhone) {
      throw new AuraError("CONFLICT", "Ce numéro est déjà utilisé.", {
        fieldErrors: {
          phoneNumber: ["Ce numéro est déjà utilisé."],
        },
      });
    }

    const passwordHash = await hashPassword(input.password);
    const refSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const user = await ctx.db.auraUser.create({
      data: {
        referralCode: `GI${refSuffix}`,
        phoneIdentities: {
          create: {
            countryCode: phone.countryCode,
            nationalNumber: phone.nationalNumber,
            phoneE164: phone.phoneE164,
          },
        },
        passwordCredential: {
          create: {
            passwordHash,
          },
        },
      },
    });

    await createSession(ctx, user.id);

    ctx.notify.via("whatsapp.welcome").send({ phoneE164: phone.phoneE164 }).catch(() => {});

    ctx.bump.success("Inscription réussie", "Bienvenue sur GlobalImex !");
    await ctx.audit.record("auth.register", {
      operation: "auth.register",
      userId: user.id,
      phoneE164: phone.phoneE164,
    });

    return {
      user: userSafe({
        id: user.id,
        phoneE164: phone.phoneE164,
        phoneVerifiedAt: null,
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.isAdmin,
      }),
    };
  });

export const authVerifyPhone = defineOperationFn("auth.verifyPhone")
  .mutate()
  .input(authVerifyOtpInputSchema)
  .entities([
    "AuraUser",
    "AuraPhoneIdentity",
    "AuraOtpChallenge",
    "AuraSession",
  ])
  .public()
  .handler<AuthSessionResult>(async ({ ctx, input }) => {
    await enforceRateLimit(ctx.db, {
      key: rateLimitKey([
        "auth",
        "verify-phone",
        ctx.request.ip,
        input.challengeId,
      ]),
      limit: 10,
      windowSeconds: 60 * 60,
    });

    const challenge = await consumeOtpChallenge({
      db: ctx.db,
      challengeId: input.challengeId,
      code: input.code,
      purpose: AuraOtpPurpose.REGISTER_PHONE,
    });

    if (!challenge.userId) {
      throw new AuraError("OTP_INVALID", "Code de vérification invalide.");
    }

    const phoneIdentity = await ctx.db.auraPhoneIdentity.update({
      where: { phoneE164: challenge.phoneE164 },
      data: { verifiedAt: new Date() },
      include: { user: true },
    });

    await createSession(ctx, phoneIdentity.userId);
    ctx.bump.success("Téléphone vérifié", "Votre session est ouverte.");
    await ctx.audit.record("auth.verifyPhone", {
      operation: "auth.verifyPhone",
      userId: phoneIdentity.userId,
    });

    return {
      user: userSafe({
        id: phoneIdentity.userId,
        phoneE164: phoneIdentity.phoneE164,
        phoneVerifiedAt: phoneIdentity.verifiedAt,
        displayName: phoneIdentity.user.displayName,
        email: phoneIdentity.user.email,
        isAdmin: phoneIdentity.user.isAdmin,
      }),
    };
  });

export const authLogin = defineOperationFn("auth.login")
  .mutate()
  .input(authLoginInputSchema)
  .entities([
    "AuraUser",
    "AuraPhoneIdentity",
    "AuraPasswordCredential",
    "AuraSession",
  ])
  .public()
  .handler<AuthSessionResult>(async ({ ctx, input }) => {
    const phone = normalizePhone({
      countryCode: input.countryCode,
      phoneNumber: input.phoneNumber,
    });
    await enforceRateLimit(ctx.db, {
      key: rateLimitKey(["auth", "login", ctx.request.ip, phone.phoneE164]),
      limit: 8,
      windowSeconds: 60 * 15,
    });

    const phoneIdentity = await ctx.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: phone.phoneE164 },
      include: {
        user: {
          include: {
            passwordCredential: true,
          },
        },
      },
    });

    const isValidPassword = await verifyPassword(
      input.password,
      phoneIdentity?.user.passwordCredential?.passwordHash,
    );

    if (
      !phoneIdentity ||
      !phoneIdentity.user ||
      phoneIdentity.user.disabledAt ||
      phoneIdentity.user.deletedAt ||
      !isValidPassword
    ) {
      throw new AuraError("UNAUTHORIZED", "Identifiants invalides.");
    }

    if (!phoneIdentity.verifiedAt) {
      await ctx.db.auraPhoneIdentity.update({
        where: { phoneE164: phoneIdentity.phoneE164 },
        data: { verifiedAt: new Date() },
      });
    }

    await createSession(ctx, phoneIdentity.userId);

    ctx.bump.success("Connexion réussie", "Bienvenue.");
    await ctx.audit.record("auth.login", {
      operation: "auth.login",
      userId: phoneIdentity.userId,
    });

    return {
      user: userSafe({
        id: phoneIdentity.userId,
        phoneE164: phoneIdentity.phoneE164,
        phoneVerifiedAt: phoneIdentity.verifiedAt ?? new Date(),
        displayName: phoneIdentity.user.displayName,
        email: phoneIdentity.user.email,
        isAdmin: phoneIdentity.user.isAdmin,
      }),
    };
  });

export const authVerifyLoginOtp = defineOperationFn("auth.verifyLoginOtp")
  .mutate()
  .input(authVerifyOtpInputSchema)
  .entities([
    "AuraUser",
    "AuraPhoneIdentity",
    "AuraOtpChallenge",
    "AuraSession",
  ])
  .public()
  .handler<AuthSessionResult>(async ({ ctx, input }) => {
    await enforceRateLimit(ctx.db, {
      key: rateLimitKey([
        "auth",
        "verify-login",
        ctx.request.ip,
        input.challengeId,
      ]),
      limit: 10,
      windowSeconds: 60 * 60,
    });

    let challenge;
    try {
      challenge = await consumeOtpChallenge({
        db: ctx.db,
        challengeId: input.challengeId,
        code: input.code,
        purpose: AuraOtpPurpose.LOGIN_PHONE,
      });
    } catch (error) {
      challenge = await consumeOtpChallenge({
        db: ctx.db,
        challengeId: input.challengeId,
        code: input.code,
        purpose: AuraOtpPurpose.REGISTER_PHONE,
      }).catch(() => {
        throw error;
      });
    }

    if (!challenge.userId) {
      throw new AuraError("OTP_INVALID", "Code de vérification invalide.");
    }

    const phoneIdentity = await ctx.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: challenge.phoneE164 },
    });

    if (!phoneIdentity || phoneIdentity.userId !== challenge.userId) {
      throw new AuraError("OTP_INVALID", "Code de vérification invalide.");
    }

    if (!phoneIdentity.verifiedAt) {
      await ctx.db.auraPhoneIdentity.update({
        where: { phoneE164: challenge.phoneE164 },
        data: { verifiedAt: new Date() },
      });
    }

    await createSession(ctx, challenge.userId);
    const refreshedPhoneIdentity =
      await ctx.db.auraPhoneIdentity.findUniqueOrThrow({
        where: { phoneE164: challenge.phoneE164 },
        include: { user: true },
      });

    ctx.bump.success("Connexion réussie", "Bienvenue.");
    await ctx.audit.record("auth.verifyLoginOtp", {
      operation: "auth.verifyLoginOtp",
      userId: challenge.userId,
    });

    return {
      user: userSafe({
        id: challenge.userId,
        phoneE164: refreshedPhoneIdentity.phoneE164,
        phoneVerifiedAt: refreshedPhoneIdentity.verifiedAt,
        displayName: refreshedPhoneIdentity.user.displayName,
        email: refreshedPhoneIdentity.user.email,
        isAdmin: refreshedPhoneIdentity.user.isAdmin,
      }),
    };
  });

export const authRequestPasswordReset = defineOperationFn(
  "auth.requestPasswordReset",
)
  .mutate()
  .input(authRequestPasswordResetInputSchema)
  .entities(["AuraUser", "AuraPhoneIdentity", "AuraOtpChallenge"])
  .public()
  .handler<AuthChallengeResult | { sent: true }>(async ({ ctx, input }) => {
    const phone = normalizePhone({
      countryCode: input.countryCode,
      phoneNumber: input.phoneNumber,
    });
    await enforceRateLimit(ctx.db, {
      key: rateLimitKey(["auth", "reset", ctx.request.ip, phone.phoneE164]),
      limit: 3,
      windowSeconds: 60 * 60,
    });

    const phoneIdentity = await ctx.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: phone.phoneE164 },
    });

    if (!phoneIdentity) {
      return { sent: true };
    }

    const result = await createAndSendOtp({
      ctx,
      phoneE164: phone.phoneE164,
      purpose: AuraOtpPurpose.RESET_PASSWORD,
      userId: phoneIdentity.userId,
    });

    ctx.bump.info(
      "Code envoyé",
      "Si ce compte existe, un code de réinitialisation a été envoyé.",
    );
    return result;
  });

export const authResetPassword = defineOperationFn("auth.resetPassword")
  .mutate()
  .input(authResetPasswordInputSchema)
  .entities([
    "AuraUser",
    "AuraPhoneIdentity",
    "AuraPasswordCredential",
    "AuraSession",
    "Referral",
  ])
  .public()
  .handler<AuthSessionResult>(async ({ ctx, input }) => {
    await enforceRateLimit(ctx.db, {
      key: rateLimitKey([
        "auth",
        "reset-confirm",
        ctx.request.ip,
        input.challengeId,
      ]),
      limit: 10,
      windowSeconds: 60 * 60,
    });

    const challenge = await consumeOtpChallenge({
      db: ctx.db,
      challengeId: input.challengeId,
      code: input.code,
      purpose: AuraOtpPurpose.RESET_PASSWORD,
    });

    if (!challenge.userId) {
      throw new AuraError("OTP_INVALID", "Code de vérification invalide.");
    }

    const passwordHash = await hashPassword(input.password);
    await ctx.db.auraPasswordCredential.upsert({
      where: { userId: challenge.userId },
      create: {
        userId: challenge.userId,
        passwordHash,
      },
      update: {
        passwordHash,
      },
    });

    await revokeAllUserSessions(ctx.db, challenge.userId);
    await createSession(ctx, challenge.userId);

    const phoneIdentity = await ctx.db.auraPhoneIdentity.findUniqueOrThrow({
      where: { phoneE164: challenge.phoneE164 },
      include: { user: true },
    });

    ctx.bump.success("Mot de passe mis à jour", "Votre session est ouverte.");
    await ctx.audit.record("auth.resetPassword", {
      operation: "auth.resetPassword",
      userId: challenge.userId,
    });

    return {
      user: userSafe({
        id: challenge.userId,
        phoneE164: phoneIdentity.phoneE164,
        phoneVerifiedAt: phoneIdentity.verifiedAt,
        displayName: phoneIdentity.user.displayName,
        email: phoneIdentity.user.email,
        isAdmin: phoneIdentity.user.isAdmin,
      }),
    };
  });

export const authLogout = defineOperationFn("auth.logout")
  .mutate()
  .entities(["AuraSession"])
  .auth()
  .handler<{ ok: true }>(async ({ ctx }) => {
    await revokeCurrentSession(ctx);
    ctx.bump.success("Déconnecté", "Votre session est terminée.");
    await ctx.audit.record("auth.logout", { operation: "auth.logout" });
    return { ok: true };
  });

export const authMe = defineOperationFn("auth.me")
  .query()
  .entities(["AuraUser", "AuraPhoneIdentity"])
  .auth()
  .handler<AuthSessionResult>(async ({ ctx }) => {
    const phoneIdentity = await ctx.db.auraPhoneIdentity.findFirst({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "asc" },
    });

    if (!phoneIdentity) {
      throw new AuraError("NOT_FOUND", "Identité téléphone introuvable.");
    }

    return {
      user: userSafe({
        id: ctx.user.id,
        phoneE164: phoneIdentity.phoneE164,
        phoneVerifiedAt: phoneIdentity.verifiedAt,
        displayName: ctx.user.displayName,
        email: ctx.user.email,
        isAdmin: ctx.user.isAdmin,
      }),
    };
  });

export const authListSessions = defineOperationFn("auth.listSessions")
  .query()
  .entities(["AuraSession"])
  .auth()
  .handler<AuthSessionListResult>(async ({ ctx }) => {
    const sessions = await ctx.db.auraSession.findMany({
      where: {
        userId: ctx.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: "desc" },
    });

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        expiresAt: session.expiresAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        current: session.id === ctx.session.id,
      })),
    };
  });

export const authRevokeAllSessions = defineOperationFn("auth.revokeAllSessions")
  .mutate()
  .entities(["AuraSession"])
  .auth()
  .handler<{ ok: true }>(async ({ ctx }) => {
    await revokeAllUserSessions(ctx.db, ctx.user.id);
    ctx.auth.clearSessionCookie();
    ctx.bump.success("Sessions révoquées", "Toutes vos sessions ont été fermées.");
    await ctx.audit.record("auth.revokeAllSessions", {
      operation: "auth.revokeAllSessions",
      userId: ctx.user.id,
    });
    return { ok: true };
  });

export const authOperations = [
  authRegister,
  authVerifyPhone,
  authLogin,
  authVerifyLoginOtp,
  authRequestPasswordReset,
  authResetPassword,
  authLogout,
  authMe,
  authListSessions,
  authRevokeAllSessions,
] as const;
