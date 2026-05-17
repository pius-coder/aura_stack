import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import { hashPassword, verifyPassword } from "@/aura/server/auth/password";
import { createSession, revokeAllUserSessions } from "@/aura/server/auth/session";
import { createOtpChallenge, consumeOtpChallenge } from "@/aura/server/auth/otp";
import { AuraOtpPurpose } from "@/generated/prisma/enums";
import { normalizePhone } from "@/aura/server/auth/phone";
import { enforceRateLimit } from "@/aura/server/rate-limit";
import { AliasService } from "./alias-service";
import { UserAgentService } from "./user-agent-service";

export class AuthService extends AuraService {

  async register(args: {
    phoneE164: string;
    email?: string;
    password: string;
    displayName?: string;
    consent?: { privacy: boolean; dataProcessing: boolean; whatsappComms: boolean };
  }) {
    const pwError = this.validatePassword(args.password);
    if (pwError) throw new AuraError("VALIDATION_ERROR", pwError);

    if (args.consent && (!args.consent.privacy || !args.consent.dataProcessing || !args.consent.whatsappComms)) {
      throw new AuraError("BAD_REQUEST", "Tous les consentements requis.");
    }

    const existingPhone = await this.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: args.phoneE164 },
    });
    if (existingPhone) {
      throw new AuraError("CONFLICT", "Ce numéro est déjà utilisé.");
    }

    const passwordHash = await hashPassword(args.password);
    const aliasSvc = new AliasService(this.ctx);
    const alias = await aliasSvc.generateUnique("FR");
    const linkCode = this.makeLinkCode();
    const linkExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const consentData = args.consent
      ? {
          privacy: { accepted: true, at: new Date().toISOString() },
          dataProcessing: { accepted: true, at: new Date().toISOString() },
          whatsappComms: { accepted: true, at: new Date().toISOString() },
        }
      : undefined;

    const user = await this.db.auraUser.create({
      data: {
        email: args.email ?? null,
        displayName: args.displayName ?? null,
        whatsappLinked: true,
        whatsappE164: args.phoneE164,
        linkCode,
        linkCodeExpiresAt: linkExpiresAt,
        passwordCredential: { create: { passwordHash } },
        phoneIdentities: {
          create: {
            countryCode: args.phoneE164.slice(0, 4),
            nationalNumber: args.phoneE164.slice(4),
            phoneE164: args.phoneE164,
            verifiedAt: new Date(),
            whatsappVerifiedAt: new Date(),
          },
        },
        profile: {
          create: {
            alias,
            displayName: args.displayName ?? null,
            language: "FR",
            isProvider: true,
            isClient: true,
            consent: consentData,
          },
        },
      },
      include: { profile: true },
    });

    await createSession(this.ctx, user.id);

    this.bump.success("Inscription réussie", "Bienvenue sur Orya !");
    void this.audit.record("user.register", { operation: "user.register", userId: user.id });

    return {
      userId: user.id,
      email: user.email,
      phoneE164: args.phoneE164,
      profileId: user.profile!.id,
      linkCode,
      linkCodeExpiresAt: linkExpiresAt.toISOString(),
    };
  }

  async login(args: { countryCode: string; phoneNumber: string; password: string }) {
    const phone = normalizePhone(args);

    await enforceRateLimit(this.db, {
      key: `auth:login:${phone.phoneE164}`,
      limit: 8,
      windowSeconds: 900,
    });

    const identity = await this.db.auraPhoneIdentity.findUnique({
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
    await enforceRateLimit(this.db, {
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

  async verifyPhoneOtp(args: {
    challengeId: string;
    code: string;
    phoneE164: string;
  }) {
    await enforceRateLimit(this.db, {
      key: `otp:verify:${args.challengeId}`,
      limit: 5,
      windowSeconds: 900,
    });

    const challenge = await consumeOtpChallenge({
      db: this.db,
      challengeId: args.challengeId,
      code: args.code,
      purpose: AuraOtpPurpose.LOGIN_PHONE,
    });

    let phoneIdentity = await this.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: challenge.phoneE164 },
      include: { user: true },
    });

    let isNewUser = false;

    if (!phoneIdentity) {
      const user = await this.db.auraUser.create({ data: {} });
      phoneIdentity = await this.db.auraPhoneIdentity.create({
        data: {
          userId: user.id,
          countryCode: challenge.phoneE164.slice(0, 4),
          nationalNumber: challenge.phoneE164.slice(4),
          phoneE164: challenge.phoneE164,
          verifiedAt: new Date(),
          whatsappVerifiedAt: new Date(),
        },
        include: { user: true },
      });

      await this.db.auraUser.update({
        where: { id: user.id },
        data: { whatsappLinked: true, whatsappE164: challenge.phoneE164 },
      });

      const aliasSvc = new AliasService(this.ctx);
      const alias = await aliasSvc.generateUnique("FR");
      await this.db.profile.create({
        data: { userId: user.id, alias, language: "FR", status: "ACTIVE" },
      });
      isNewUser = true;
    } else {
      if (!phoneIdentity.verifiedAt || !phoneIdentity.whatsappVerifiedAt) {
        await this.db.auraPhoneIdentity.update({
          where: { id: phoneIdentity.id },
          data: { verifiedAt: new Date(), whatsappVerifiedAt: new Date() },
        });
      }
      if (!phoneIdentity.user.whatsappLinked) {
        await this.db.auraUser.update({
          where: { id: phoneIdentity.userId },
          data: { whatsappLinked: true, whatsappE164: challenge.phoneE164 },
        });
      }
    }

    await createSession(this.ctx, phoneIdentity.userId);

    const profile = await this.db.profile.findUnique({
      where: { userId: phoneIdentity.userId },
    });

    return {
      userId: phoneIdentity.userId,
      isNewUser,
      hasProfile: !!(profile?.displayName),
    };
  }

  async requestPasswordReset(args: { countryCode: string; phoneNumber: string }) {
    const phone = normalizePhone(args);

    await enforceRateLimit(this.db, {
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
    const pwError = this.validatePassword(args.password);
    if (pwError) throw new AuraError("VALIDATION_ERROR", pwError);

    const challenge = await consumeOtpChallenge({
      db: this.db,
      challengeId: args.challengeId,
      code: args.code,
      purpose: AuraOtpPurpose.RESET_PASSWORD,
    });

    if (!challenge.userId) {
      throw new AuraError("BAD_REQUEST", "Code de vérification invalide.");
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

  async generateLinkCode(phoneE164?: string) {
    const code = this.makeLinkCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    if (!this.user) throw new AuraError("UNAUTHORIZED", "Authentification requise.");

    await this.db.auraUser.update({
      where: { id: this.user.id },
      data: { linkCode: code, linkCodeExpiresAt: expiresAt },
    });

    if (phoneE164) {
      await this.db.auraPhoneIdentity.updateMany({
        where: { phoneE164, userId: this.user.id },
        data: { linkCode: code, linkCodeExpiresAt: expiresAt },
      });
    }

    return { code, expiresAt: expiresAt.toISOString() };
  }

  async processDevChat(phoneE164: string, text: string) {
    let user = await this.db.auraUser.findFirst({
      where: { phoneIdentities: { some: { phoneE164 } } },
      include: { phoneIdentities: { where: { phoneE164 } }, profile: true },
    });

    if (!user) {
      user = await this.db.auraUser.create({
        data: {
          whatsappLinked: true,
          whatsappE164: phoneE164,
          phoneIdentities: {
            create: {
              countryCode: phoneE164.slice(0, 4),
              nationalNumber: phoneE164.slice(4),
              phoneE164,
              verifiedAt: new Date(),
              whatsappVerifiedAt: new Date(),
            },
          },
          profile: {
            create: {
              alias: `dev-${Math.random().toString(36).slice(2, 10)}`,
              language: "FR",
              status: "ACTIVE",
            },
          },
        },
        include: { phoneIdentities: { where: { phoneE164 } }, profile: true },
      });
    }

    let reply: string;
    let trace: import("./user-agent-service").TraceStep[] = [];
    try {
      const agentSvc = new UserAgentService(this.ctx);
      const result = await agentSvc.processMessageWithTrace(user.id, text);
      reply = result.reply;
      trace = result.trace;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) {
        reply = "⚠️ L'IA Orya est momentanément saturée (trop de requêtes). Veuillez réessayer dans quelques secondes.";
      } else if (msg.includes("401") || msg.includes("auth") || msg.includes("key")) {
        reply = "⚠️ Erreur d'authentification de l'IA. Contactez l'administrateur.";
      } else {
        reply = `⚠️ Erreur IA: ${msg.slice(0, 200)}`;
      }
    }

    return { reply, userId: user.id, isNew: user.profile?.displayName ? false : true, pipelineTrace: trace }; /**/
  }

  async linkWhatsApp(phoneE164: string, linkCode: string) {
    const identity = await this.db.auraPhoneIdentity.findFirst({
      where: { linkCode, phoneE164 },
    });
    if (!identity) return { ok: false as const, reason: "INVALID_CODE" as const };

    if (!identity.linkCodeExpiresAt || identity.linkCodeExpiresAt < new Date()) {
      return { ok: false as const, reason: "CODE_EXPIRED" as const };
    }

    await this.db.auraPhoneIdentity.update({
      where: { id: identity.id },
      data: { whatsappVerifiedAt: new Date(), linkCode: null, linkCodeExpiresAt: null },
    });
    await this.db.auraUser.update({
      where: { id: identity.userId },
      data: { whatsappLinked: true, whatsappE164: phoneE164 },
    });

    return { ok: true as const, userId: identity.userId };
  }

  private validatePassword(password: string): string | null {
    if (password.length < 12) return "Le mot de passe doit contenir au moins 12 caractères.";
    if (!/[A-Za-z]/.test(password)) return "Le mot de passe doit contenir au moins une lettre.";
    if (!/[0-9]/.test(password)) return "Le mot de passe doit contenir au moins un chiffre.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Le mot de passe doit contenir au moins un caractère spécial.";
    return null;
  }

  private makeLinkCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
}
