import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import { hashPassword, verifyPassword } from "@/aura/server/auth/password";
import { createSession, revokeAllUserSessions } from "@/aura/server/auth/session";
import { createOtpChallenge, consumeOtpChallenge } from "@/aura/server/auth/otp";
import { AuraOtpPurpose } from "@/generated/prisma/enums";
import { normalizePhone } from "@/aura/server/auth/phone";
import { enforceRateLimit } from "@/aura/server/rate-limit";
import { AliasService } from "./alias-service";

const LINK_CODE_LENGTH = 8;
const LINK_CODE_EXPIRY_MINUTES = 30;

function generateLinkCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class AuthService extends AuraService {
  async register(args: { email: string; password: string; displayName?: string }) {
    const existing = await this.db.auraUser.findUnique({ where: { email: args.email } });
    if (existing) {
      throw new AuraError("CONFLICT", "Cet email est déjà utilisé.");
    }

    const passwordHash = await hashPassword(args.password);
    const aliasSvc = new AliasService(this.ctx);
    const alias = await aliasSvc.generateUnique("FR");
    const linkCode = generateLinkCode();
    const linkExpiresAt = new Date(Date.now() + LINK_CODE_EXPIRY_MINUTES * 60 * 1000);

    const user = await this.db.auraUser.create({
      data: {
        email: args.email,
        displayName: args.displayName ?? null,
        passwordCredential: { create: { passwordHash } },
        profile: { create: { alias, displayName: args.displayName ?? null, language: "FR" } },
      },
      include: { profile: true },
    });

    await createSession(this.ctx, user.id);

    this.bump.success("Inscription réussie", "Bienvenue sur Orya !");
    void this.audit.record("user.register", { operation: "user.register", userId: user.id });

    return {
      userId: user.id,
      email: user.email,
      profileId: user.profile!.id,
      linkCode,
      linkCodeExpiresAt: linkExpiresAt.toISOString(),
    };
  }

  async login(args: { countryCode: string; phoneNumber: string; password: string }) {
    const phone = normalizePhone(args);

    await enforceRateLimit(this.ctx.db, {
      key: `auth:login:${phone.phoneE164}`,
      limit: 8,
      windowSeconds: 900,
    });

    const identity = await this.ctx.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: phone.phoneE164 },
      include: { user: { include: { passwordCredential: true } } },
    });

    const valid = await verifyPassword(args.password, identity?.user?.passwordCredential?.passwordHash);

    if (!identity || !valid || identity.user.disabledAt || identity.user.deletedAt) {
      throw new AuraError("UNAUTHORIZED", "Identifiants invalides.");
    }

    await createSession(this.ctx, identity.userId);

    if (!identity.verifiedAt) {
      await this.db.auraPhoneIdentity.update({
        where: { id: identity.id },
        data: { verifiedAt: new Date() },
      });
    }

    this.bump.success("Connexion réussie", "Bienvenue.");
    void this.audit.record("auth.login", { operation: "auth.login", userId: identity.userId });

    return { userId: identity.userId };
  }

  async startPhoneOtp(args: { phoneE164: string }) {
    await enforceRateLimit(this.ctx.db, {
      key: `otp:request:${args.phoneE164}`,
      limit: 3,
      windowSeconds: 900,
    });

    const challenge = await createOtpChallenge({
      db: this.db,
      phoneE164: args.phoneE164,
      purpose: AuraOtpPurpose.LOGIN_PHONE,
    });

    return { challengeId: challenge.challengeId, code: challenge.code };
  }

  async verifyPhoneOtp(args: { challengeId: string; code: string }) {
    const challenge = await consumeOtpChallenge({
      db: this.db,
      challengeId: args.challengeId,
      code: args.code,
      purpose: AuraOtpPurpose.LOGIN_PHONE,
    });

    if (!challenge.userId) {
      throw new AuraError("OTP_INVALID", "Code de vérification invalide.");
    }

    await createSession(this.ctx, challenge.userId);

    return { userId: challenge.userId };
  }

  async requestPasswordReset(args: { countryCode: string; phoneNumber: string }) {
    const phone = normalizePhone(args);

    await enforceRateLimit(this.ctx.db, {
      key: `auth:reset:${phone.phoneE164}`,
      limit: 3,
      windowSeconds: 3600,
    });

    const identity = await this.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: phone.phoneE164 },
    });

    if (!identity) return { sent: true as const };

    const challenge = await createOtpChallenge({
      db: this.db,
      phoneE164: phone.phoneE164,
      purpose: AuraOtpPurpose.RESET_PASSWORD,
      userId: identity.userId,
    });

    return { challengeId: challenge.challengeId, code: challenge.code, sent: true as const };
  }

  async resetPassword(args: { challengeId: string; code: string; password: string }) {
    const challenge = await consumeOtpChallenge({
      db: this.db,
      challengeId: args.challengeId,
      code: args.code,
      purpose: AuraOtpPurpose.RESET_PASSWORD,
    });

    if (!challenge.userId) {
      throw new AuraError("OTP_INVALID", "Code de vérification invalide.");
    }

    const passwordHash = await hashPassword(args.password);
    await this.db.auraPasswordCredential.upsert({
      where: { userId: challenge.userId },
      create: { userId: challenge.userId, passwordHash },
      update: { passwordHash },
    });

    await revokeAllUserSessions(this.db, challenge.userId);
    await createSession(this.ctx, challenge.userId);

    this.bump.success("Mot de passe mis à jour", "Votre session est ouverte.");
    void this.audit.record("auth.resetPassword", { operation: "auth.resetPassword", userId: challenge.userId });

    return { userId: challenge.userId };
  }

  async generateLinkCode(phoneE164: string) {
    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_EXPIRY_MINUTES * 60 * 1000);

    await this.db.auraPhoneIdentity.updateMany({
      where: { phoneE164, userId: this.user?.id },
      data: { linkCode: code, linkCodeExpiresAt: expiresAt },
    });

    return { code, expiresAt: expiresAt.toISOString() };
  }
}
