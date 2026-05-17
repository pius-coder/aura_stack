import { AuraError } from "@/aura/core/errors";
import { AuraService } from "@/aura/server/service";
import { ChatService } from "./chat-service";
import { MatchService } from "./match-service";
import { UserAgentService } from "./user-agent-service";

type DevSeed = {
  phoneE164: string;
  displayName: string;
  alias: string;
  bio: string;
  locationLabel: string;
  language: "FR" | "EN";
  isProvider: boolean;
  isClient: boolean;
  services: Array<{
    title: string;
    description: string;
    priceXaf: number;
    zone?: string;
  }>;
};

const DEV_LAB_SEEDS: DevSeed[] = [
  {
    phoneE164: "+237612345678",
    displayName: "Mireille",
    alias: "mireille-douala",
    bio: "Plombiere de quartier specialisee dans les depannages rapides a Douala.",
    locationLabel: "Douala",
    language: "FR",
    isProvider: true,
    isClient: true,
    services: [
      {
        title: "Plomberie d'urgence",
        description: "Fuites, robinets, debouchage et depannage a domicile.",
        priceXaf: 15000,
        zone: "Douala",
      },
    ],
  },
  {
    phoneE164: "+237698765432",
    displayName: "Kevin",
    alias: "kevin-elec",
    bio: "Electricien mobile pour maisons, boutiques et petits bureaux.",
    locationLabel: "Douala",
    language: "EN",
    isProvider: true,
    isClient: true,
    services: [
      {
        title: "Electricite residentielle",
        description: "Installation, maintenance and urgent troubleshooting.",
        priceXaf: 18000,
        zone: "Douala",
      },
    ],
  },
  {
    phoneE164: "+237655000111",
    displayName: "Sandrine",
    alias: "sandrine-beaute",
    bio: "Maquilleuse et coiffeuse evenementielle pour mariages et shootings.",
    locationLabel: "Yaounde",
    language: "FR",
    isProvider: true,
    isClient: true,
    services: [
      {
        title: "Maquillage evenementiel",
        description: "Beauté mariage, soiree et contenu lifestyle.",
        priceXaf: 25000,
        zone: "Yaounde",
      },
    ],
  },
  {
    phoneE164: "+237699000111",
    displayName: "Jean",
    alias: "jean-photo",
    bio: "Photographe evenementiel et portrait, disponible a Douala et Bonaberi.",
    locationLabel: "Douala",
    language: "FR",
    isProvider: true,
    isClient: true,
    services: [
      {
        title: "Photo evenementielle",
        description: "Mariage, anniversaire, portrait et video courte.",
        priceXaf: 40000,
        zone: "Douala",
      },
    ],
  },
  {
    phoneE164: "+237677111222",
    displayName: "Aicha",
    alias: "aicha-design",
    bio: "Designer graphique pour petites entreprises, flyers et identites visuelles.",
    locationLabel: "Bafoussam",
    language: "FR",
    isProvider: true,
    isClient: true,
    services: [
      {
        title: "Design graphique",
        description: "Logos, affiches, menus, brochures et kits reseaux sociaux.",
        priceXaf: 30000,
        zone: "Bafoussam",
      },
    ],
  },
  {
    phoneE164: "+237671222333",
    displayName: "Serge",
    alias: "serge-batiment",
    bio: "Technicien polyvalent pour plomberie, petits travaux et maintenance maison.",
    locationLabel: "Bonaberi",
    language: "FR",
    isProvider: true,
    isClient: true,
    services: [
      {
        title: "Maintenance maison",
        description: "Petits travaux, plomberie legere et interventions rapides.",
        priceXaf: 12000,
        zone: "Bonaberi",
      },
    ],
  },
];

function normalizePhone(phoneE164: string): string {
  const trimmed = phoneE164.trim().replace(/[^\d+]/g, "");
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

function makeGenericAlias(phoneE164: string): string {
  return `lab-${phoneE164.replace(/[^\d]/g, "").slice(-6)}`;
}

function makeGenericName(phoneE164: string): string {
  const suffix = phoneE164.replace(/[^\d]/g, "").slice(-4);
  return `Profil ${suffix}`;
}

export class DevLabService extends AuraService {
  async chat(phoneE164: string, text: string) {
    this.assertEnabled();

    const user = await this.ensureProfileForPhone(phoneE164);
    const agentService = new UserAgentService(this.ctx);
    const turn = await agentService.processMessageWithTrace(user.id, text);

    return {
      reply: turn.reply,
      userId: user.id,
      phoneE164: user.phoneE164,
      isNew: false,
      pipelineTrace: turn.trace,
      intent: turn.intent,
      action: turn.action,
      language: turn.language,
      extraction: turn.extraction,
      matchSessionId: turn.matchSessionId,
      selectionContext: turn.selectionContext,
    };
  }

  async getState(phoneE164: string) {
    this.assertEnabled();

    const contacts = await this.ensureSeedProfiles();
    const activeUser = await this.ensureProfileForPhone(phoneE164);

    const [matches, conversations] = await Promise.all([
      this.db.match.findMany({
        where: {
          OR: [{ requesterId: activeUser.id }, { targetId: activeUser.id }],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          requester: {
            select: {
              userId: true,
              alias: true,
              displayName: true,
            },
          },
          target: {
            select: {
              userId: true,
              alias: true,
              displayName: true,
            },
          },
          conversation: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
      this.db.conversation.findMany({
        where: {
          OR: [{ userAId: activeUser.id }, { userBId: activeUser.id }],
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 25,
          },
          match: {
            include: {
              requester: {
                select: {
                  userId: true,
                  alias: true,
                  displayName: true,
                },
              },
              target: {
                select: {
                  userId: true,
                  alias: true,
                  displayName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const mappedMatches = matches.map((match) => {
      const isIncoming = match.targetId === activeUser.id;
      const counterpart = isIncoming ? match.requester : match.target;
      return {
        id: match.id,
        status: match.status,
        createdAt: match.createdAt.toISOString(),
        isIncoming,
        counterpart: {
          userId: counterpart.userId,
          alias: counterpart.alias,
          displayName: counterpart.displayName,
        },
        conversationId: match.conversation?.id ?? null,
      };
    });

    const mappedConversations = conversations.map((conversation) => {
      const counterpart =
        conversation.match.requester.userId === activeUser.id
          ? conversation.match.target
          : conversation.match.requester;

      return {
        id: conversation.id,
        status: conversation.status,
        createdAt: conversation.createdAt.toISOString(),
        counterpart: {
          userId: counterpart.userId,
          alias: counterpart.alias,
          displayName: counterpart.displayName,
        },
        messages: conversation.messages.map((message) => ({
          id: message.id,
          body: message.body,
          senderId: message.senderId,
          createdAt: message.createdAt.toISOString(),
          direction: message.senderId === activeUser.id ? "out" : "in",
        })),
      };
    });

    const events = [
      ...mappedMatches.map((match) => ({
        id: `match-${match.id}`,
        createdAt: match.createdAt,
        title: match.isIncoming ? "Demande recue" : "Demande envoyee",
        body: `${match.counterpart.alias} · ${match.status}`,
      })),
      ...mappedConversations.flatMap((conversation) =>
        conversation.messages.slice(-3).map((message) => ({
          id: `message-${message.id}`,
          createdAt: message.createdAt,
          title: conversation.counterpart.alias,
          body: message.body,
        })),
      ),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);

    return {
      contacts,
      activeProfile: {
        userId: activeUser.id,
        phoneE164: activeUser.phoneE164,
        alias: activeUser.profile.alias,
        displayName: activeUser.profile.displayName,
        bio: activeUser.profile.bio,
        locationLabel: activeUser.profile.locationLabel,
        language: activeUser.profile.language,
        isProvider: activeUser.profile.isProvider,
        isClient: activeUser.profile.isClient,
        services: activeUser.services.map((service) => ({
          id: service.id,
          title: service.title,
          priceXaf: service.priceXaf,
          zone: service.zone,
        })),
      },
      matches: mappedMatches,
      conversations: mappedConversations,
      events,
    };
  }

  async actOnMatch(
    phoneE164: string,
    matchId: string,
    action: "accept" | "refuse" | "cancel",
  ) {
    this.assertEnabled();

    const user = await this.ensureProfileForPhone(phoneE164);
    const matchService = new MatchService(this.ctx);

    if (action === "accept") {
      return matchService.accept(user.id, matchId);
    }
    if (action === "refuse") {
      return matchService.refuse(user.id, matchId);
    }
    return matchService.cancel(user.id, matchId);
  }

  async sendConversationMessage(
    phoneE164: string,
    conversationId: string,
    body: string,
  ) {
    this.assertEnabled();

    const user = await this.ensureProfileForPhone(phoneE164);
    const chatService = new ChatService(this.ctx);
    return chatService.sendMessage(user.id, conversationId, body);
  }

  private assertEnabled() {
    if (process.env.NODE_ENV === "production") {
      throw new AuraError("FORBIDDEN", "Le labo Orya est desactive en production.");
    }
  }

  private async ensureSeedProfiles() {
    const ensured = [];
    for (const seed of DEV_LAB_SEEDS) {
      const user = await this.ensureProfileForPhone(seed.phoneE164);
      ensured.push({
        userId: user.id,
        phoneE164: user.phoneE164,
        alias: user.profile.alias,
        displayName: user.profile.displayName ?? seed.displayName,
        locationLabel: user.profile.locationLabel,
      });
    }
    return ensured;
  }

  private async ensureProfileForPhone(phoneE164: string) {
    const normalizedPhone = normalizePhone(phoneE164);
    const seed = DEV_LAB_SEEDS.find((entry) => entry.phoneE164 === normalizedPhone);

    const existingIdentity = await this.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: normalizedPhone },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!existingIdentity) {
      const created = await this.db.auraUser.create({
        data: {
          displayName: seed?.displayName ?? makeGenericName(normalizedPhone),
          whatsappLinked: true,
          whatsappE164: normalizedPhone,
          phoneIdentities: {
            create: {
              countryCode: normalizedPhone.slice(0, 4),
              nationalNumber: normalizedPhone.slice(4),
              phoneE164: normalizedPhone,
              verifiedAt: new Date(),
              whatsappVerifiedAt: new Date(),
            },
          },
          profile: {
            create: {
              alias: seed?.alias ?? makeGenericAlias(normalizedPhone),
              displayName: seed?.displayName ?? makeGenericName(normalizedPhone),
              bio: seed?.bio ?? "Profil de test pour le labo Orya.",
              locationLabel: seed?.locationLabel ?? "Douala",
              language: seed?.language ?? "FR",
              status: "ACTIVE",
              isProvider: seed?.isProvider ?? true,
              isClient: seed?.isClient ?? true,
            },
          },
        },
        include: {
          profile: true,
        },
      });

      await this.ensureSeedServices(created.id, seed);
      return this.loadDevUser(created.id, normalizedPhone);
    }

    if (!existingIdentity.verifiedAt || !existingIdentity.whatsappVerifiedAt) {
      await this.db.auraPhoneIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          verifiedAt: existingIdentity.verifiedAt ?? new Date(),
          whatsappVerifiedAt: existingIdentity.whatsappVerifiedAt ?? new Date(),
        },
      });
    }

    const profile = existingIdentity.user.profile
      ? existingIdentity.user.profile
      : await this.db.profile.create({
          data: {
            userId: existingIdentity.userId,
            alias: seed?.alias ?? makeGenericAlias(normalizedPhone),
            displayName: seed?.displayName ?? existingIdentity.user.displayName ?? makeGenericName(normalizedPhone),
            bio: seed?.bio ?? "Profil de test pour le labo Orya.",
            locationLabel: seed?.locationLabel ?? "Douala",
            language: seed?.language ?? "FR",
            status: "ACTIVE",
            isProvider: seed?.isProvider ?? true,
            isClient: seed?.isClient ?? true,
          },
        });

    if (seed) {
      await this.db.auraUser.update({
        where: { id: existingIdentity.userId },
        data: {
          displayName: seed.displayName,
          whatsappLinked: true,
          whatsappE164: normalizedPhone,
        },
      });

      await this.db.profile.update({
        where: { userId: existingIdentity.userId },
        data: {
          alias: seed.alias,
          displayName: seed.displayName,
          bio: seed.bio,
          locationLabel: seed.locationLabel,
          language: seed.language,
          status: "ACTIVE",
          isProvider: seed.isProvider,
          isClient: seed.isClient,
        },
      });
    }

    if (!profile && seed) {
      await this.db.profile.update({
        where: { userId: existingIdentity.userId },
        data: {
          alias: seed.alias,
        },
      });
    }

    await this.ensureSeedServices(existingIdentity.userId, seed);
    return this.loadDevUser(existingIdentity.userId, normalizedPhone);
  }

  private async ensureSeedServices(userId: string, seed?: DevSeed) {
    if (!seed) return;

    const existing = await this.db.service.findMany({
      where: {
        userId,
        deletedAt: null,
      },
    });

    for (const service of seed.services) {
      const current = existing.find((entry) => entry.title === service.title);
      if (current) {
        await this.db.service.update({
          where: { id: current.id },
          data: {
            description: service.description,
            priceXaf: service.priceXaf,
            zone: service.zone ?? null,
            isActive: true,
            availability: "AVAILABLE",
            deletedAt: null,
          },
        });
        continue;
      }

      await this.db.service.create({
        data: {
          userId,
          title: service.title,
          description: service.description,
          priceXaf: service.priceXaf,
          zone: service.zone ?? null,
          isActive: true,
          availability: "AVAILABLE",
        },
      });
    }
  }

  private async loadDevUser(userId: string, phoneE164: string) {
    const user = await this.db.auraUser.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });
    if (!user?.profile) {
      throw new AuraError("NOT_FOUND", "Profil de labo introuvable.");
    }

    const services = await this.db.service.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      id: user.id,
      phoneE164,
      profile: user.profile,
      services,
    };
  }
}
