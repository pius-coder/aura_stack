# Design — WhatsApp AI Matchmaking Platform

## Introduction

Ce document décrit l'architecture technique de la **WhatsApp AI Matchmaking Platform** construite sur le framework Aura (TanStack Start + Hono + Prisma + PostgreSQL/pgvector + Aura Broadcast WebSocket). Il couvre les 52 requirements du document `requirements.md` regroupés en 8 sections : Métier (R1-10), Bot WhatsApp et Persona (R11-16), Graph RAG IA (R17-23), Chat Anonyme et Double Opt-in (R24-27), Paiements et Monétisation (R28-34), Sécurité et Conformité (R35-40), Performances et Observabilité (R41-50), Simulation & Cohérence de pipeline (R51-R52).

La plateforme se distingue par **quatre choix architecturaux structurants** qui irriguent l'ensemble du design :

1. **Une instance LangGraph par utilisateur** plutôt qu'un agent monolithique partagé. Chaque utilisateur lié à WhatsApp possède son propre `Graphe_Agent_User`, persisté via le checkpointer PostgreSQL natif d'Aura. Cela isole les états conversationnels, simplifie l'observabilité par utilisateur et permet d'évoluer vers des personas différenciées (par segment, par région) sans refonte.
2. **Un orchestrateur de matching séparé** des agents de conversation. L'`Orchestrateur_Matching` est un graphe LangGraph indépendant invoqué via tool calling depuis l'agent utilisateur. Cette séparation permet d'optimiser indépendamment les latences (l'orchestrateur cible 800 ms p95 sur le traversal, 300 ms p95 sur la similarité vectorielle), de paralléliser les composants Graph et Vector, et de mettre en cache les résultats dans Redis avec TTL 60 s.
3. **Un Knowledge Graph relationnel hybride** stocké directement en PostgreSQL plutôt que dans une base graphe dédiée. Les entités (`User`, `Service`, `Skill`, `Location`, `Industry`, `Need`) et leurs relations typées (`PROVIDES`, `REQUIRES`, `LOCATED_IN`, `LOOKS_FOR`, `MATCHES`, `CONNECTED_TO`, `RATED`) sont stockées dans deux tables `entities` et `relations` exploitées par CTE récursives pour le traversal. Les embeddings vivent dans `graph_embeddings` (pgvector, HNSW, 1536 dimensions). Le matching final fusionne les deux signaux par **Reciprocal Rank Fusion (RRF)** suivi d'un module de diversité (Diversity_Mix) qui mixe profils très compatibles et profils complémentaires.
4. **Une stratégie simulation-first avec pipeline unique**. Le Bot_WhatsApp, le chat Orya du dashboard et le `Dev_Sandbox_Orya_Lab` passent tous par le même `UserAgentService`, les mêmes prompts versionnés, les mêmes contrats métier (`CanonicalWhatsAppMessage`, `OryaIntent`, `OryaTurnResult`) et le même moteur de matching retrieval-first.

Le design s'appuie systématiquement sur les primitives du framework Aura (cf. `.kiro/specs/aura-hono-tanstack-migration/design.md`) : `defineOperationFn` (queries, mutations, actions), `defineAgent`, `defineWorkflow`, `defineHttpAction`, `defineVectorIndex`, `defineSearchIndex`, `ctx.scheduler`, `ctx.storage`, broadcast WebSocket, components `@aura/auth`, `@aura/storage`, `@aura/notifications`, `@aura/rate-limit`, et le pattern `AuraService` (Decision 26). Les conventions kebab-case et la structure `src/operations/{domain}/{name}.{kind}.ts` sont appliquées partout.

**Pattern AuraService** : chaque couche métier expose un service qui `extends AuraService`. Les operations deviennent des thin handlers qui instancient le service et délèguent. Les services composent entre eux par constructeur.

```ts
// Operation = thin transport (validation + auth + délégation)
defineOperationFn("chat.send-message")
  .mutate()
  .input(z.object({ conversationId: z.string(), body: z.string() }))
  .entities(["ChatMessage", "Conversation"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ChatService(ctx);
    return svc.sendMessage(ctx.user.id, input.conversationId, input.body);
  });

// Service = logique métier (DB + side effects via this.*)
class ChatService extends AuraService {
  async sendMessage(userId: string, conversationId: string, body: string) {
    const conv = await this.db.conversation.findUnique(...);
    const msg = await this.db.chatMessage.create(...);
    await this.notifyNewMessage(conv, msg);
    return msg;
  }
}
```

### Scope du design

Ce document **conçoit** :

- L'architecture des couches (Transport WhatsApp, Instance IA, Orchestrateur, Knowledge Graph, Chat, Paiement, Observabilité).
- Le schéma de données complet (tables Aura existantes + tables métier + tables Graph RAG + tables d'observabilité).
- Les algorithmes du Graph RAG (extraction, traversal, RRF, diversité) avec pseudo-code et SQL exemples.
- La structure des graphes LangGraph (Graphe_Agent_User et Orchestrateur_Matching) avec contrats de nodes.
- Les intégrations externes (WhatsApp via Baileys/Evolution_API puis WA Business API, Fapshi, Flutterwave en phase 3).
- Les propriétés de correction (correctness properties) qui guideront les tests.
- La stratégie de tests, le déploiement et la roadmap d'implémentation.

Ce document **ne conçoit pas** (laissé aux specs filles ou à la phase de tasks) :

- Les écrans Dashboard_Web pixel-parfaits (laissés au design produit shadcn).
- Les prompts LLM exacts (versionnés dans `src/prompts/` avec tests de régression).
- Les politiques de modération détaillées (élaborées avec l'équipe juridique).

### Légende des références croisées

Tout au long du document, la notation **R<n>** ou **R<n>.<m>** renvoie au requirement correspondant dans `requirements.md`. Les tables et diagrammes sont identifiés par numéro pour faciliter les revues.

---

## Vue d'ensemble

### Schéma global de l'architecture

```
                                     UTILISATEURS
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  │                                               │
                  ▼                                               ▼
          ┌───────────────┐                              ┌────────────────┐
          │   WhatsApp    │                              │  Navigateur    │
          │ (FR/EN, mobile)│                              │  (Dashboard)   │
          └───────┬───────┘                              └────────┬───────┘
                  │ messages chiffrés                             │ HTTPS
                  │                                               │ + WebSocket
                  ▼                                               ▼
       ┌────────────────────┐                          ┌──────────────────────┐
       │  Evolution_API     │                          │  TanStack Start      │
       │  (Baileys MVP →    │                          │  (SSR + hydration    │
       │  WA Business API)  │                          │   TanStack Query)    │
       └─────────┬──────────┘                          └──────────┬───────────┘
                 │ HTTP webhook                                    │ in-process
                 │ POST /webhooks/whatsapp                         │ callAuraServer
                 ▼                                                 ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │                    PROCESSUS APP UNIQUE (Bun/Node)              │
       │                                                                 │
       │   ┌──────────────────────┐      ┌────────────────────────────┐  │
       │   │   Hono App (Aura)    │      │  Aura Operations Runtime   │  │
       │   │  /aura/*             │◀────▶│  defineOperationFn         │  │
       │   │  /aura-internal/*    │      │  (query/mutate/action)     │  │
       │   │  /aura-http/*        │      └─────────────┬──────────────┘  │
       │   │  /files/*  /health   │                    │                 │
       │   └──────────┬───────────┘                    │                 │
       │              │                                 │                 │
       │              │ defineHttpAction                │                 │
       │              ▼                                 ▼                 │
       │   ┌────────────────────────────────────────────────────────┐    │
       │   │        Webhook_WhatsApp (Hono handler + HMAC)          │    │
       │   │   1. Validation signature  2. Inbox canonique          │    │
       │   │   3. Scheduler process-incoming 4. ACK                 │    │
       │   └──────────────────┬─────────────────────────────────────┘    │
       │                      │ enqueue                                   │
       │                      ▼                                            │
       │   ┌────────────────────────────────────────────────────────┐    │
       │   │   Worker WhatsApp (Aura Scheduler + InboxService)      │    │
       │   │   Pour chaque message:                                 │    │
       │   │     ├─▶ relit CanonicalWhatsAppMessage                 │    │
       │   │     ├─▶ traite link_code avant résolution user         │    │
       │   │     └─▶ invoke Graphe_Agent_User[user_id]              │    │
       │   └──────────────────┬─────────────────────────────────────┘    │
       │                      │                                            │
       │                      ▼                                            │
       │   ┌────────────────────────────────────────────────────────┐    │
       │   │   Graphe_Agent_User (LangGraph, 1 instance/user)       │    │
       │   │                                                        │    │
       │   │   Hydration ──▶ Conversation ──▶ Extraction ──┐       │    │
       │   │       │              │              │         │        │    │
       │   │       │              ▼              ▼         │        │    │
       │   │       │       MatchingIntent ──▶ Orchestr.   │        │    │
       │   │       │              │           CallNode    │        │    │
       │   │       │              ▼              │         │        │    │
       │   │       └─────▶ ResponseNode ◀────────┘        │        │    │
       │   │              (persona guardrail)             │        │    │
       │   │                                              │        │    │
       │   │   Checkpointer: agent_states (Postgres)      │        │    │
       │   └──────────────────┬───────────────────────────┘        │    │
       │                      │ tool call                          │    │
       │                      ▼                                    │    │
       │   ┌────────────────────────────────────────────────────────┐    │
       │   │   Orchestrateur_Matching (LangGraph séparé)            │    │
       │   │                                                        │    │
       │   │   ReceiveRequest ──┬──▶ GraphTraversal ──┐             │    │
       │   │                    │                     ▼             │    │
       │   │                    └──▶ EmbeddingQuery ──▶ HybridScoring│    │
       │   │                                          │             │    │
       │   │                                          ▼             │    │
       │   │                          Diversity ──▶ Filter ──▶ Return│    │
       │   └─────┬────────────────────────────┬─────────────────────┘    │
       │         │                            │                            │
       │         ▼                            ▼                            │
       │   ┌──────────────────┐    ┌────────────────────────┐              │
       │   │  Knowledge Graph │    │     pgvector HNSW      │              │
       │   │  CTE récursive   │    │    cosine, 1536 dim    │              │
       │   │  entities/       │    │    graph_embeddings    │              │
       │   │  relations       │    │                        │              │
       │   └────────┬─────────┘    └────────────┬───────────┘              │
       │            │                            │                          │
       │            └─────────────┬──────────────┘                          │
       │                          ▼                                          │
       │              ┌──────────────────────────┐                           │
       │              │  PostgreSQL 15 + pgvector│                           │
       │              │  + Redis (cache + queue) │                           │
       │              └──────────────────────────┘                           │
       │                                                                     │
       │   ┌────────────────────────────────────────────────────────┐       │
       │   │  Aura Broadcast WebSocket                              │       │
       │   │  rooms: conversation:{id}, user:{id}, admin:disputes   │       │
       │   │  events: INVALIDATE | message:new | presence | typing  │       │
       │   └────────────────────────────────────────────────────────┘       │
       └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Webhooks signés
                                    ▼
                  ┌────────────────────────────────────┐
                  │  Provider_Fapshi (MVP/phase 2)     │
                  │  Provider_Flutterwave (phase 3)    │
                  │  MTN MoMo · Orange Money · cartes  │
                  └────────────────────────────────────┘
```

### Flux de données entrants

| Source | Endpoint Hono | Mécanisme | Destination |
|--------|---------------|-----------|-------------|
| Message WhatsApp utilisateur | `POST /webhooks/whatsapp` (`defineHttpAction`) | HMAC validation → `WhatsappInbox` canonique → scheduler `agent.process-incoming` | `Graphe_Agent_User[user_id]` |
| Webhook paiement Fapshi | `POST /webhooks/fapshi` (`defineHttpAction`) | HMAC validation → idempotence par `provider_trans_id` | Activation produit + Notification_WhatsApp |
| Webhook paiement Flutterwave (phase 3) | `POST /webhooks/flutterwave` | HMAC + idempotence | Idem |
| Inscription / mutation Dashboard | `POST /aura/*` (bridge Aura) | CSRF + auth Aura | Operation `users.*`, `services.*`, etc. |
| Saisie service / profil | Mutation Aura | invalidation entités → broadcast | Régénération embeddings via scheduler |

### Flux de données sortants

| Origine | Cible | Mécanisme |
|---------|-------|-----------|
| Réponse Bot_WhatsApp | Utilisateur WhatsApp | Evolution_API REST (idempotency-key, retry exponentiel) |
| Notification_WhatsApp d'événement | Utilisateur WhatsApp | Worker scheduler → Evolution_API |
| Message chat anonyme | Participants en ligne | Aura broadcast WS room `conversation:{id}` |
| Message chat anonyme (offline) | Notification_WhatsApp | Idem ci-dessus |
| Invalidations cache | Tous les onglets connectés | Aura broadcast WS event `INVALIDATE` |
| Métriques business / IA | Admin_Console | Queries Aura sur `llm_calls`, `match_sessions`, `payments` |

### Composants déployés (vue runtime)

```
┌─────────────────────────────────────────────────────────┐
│  VPS Linux (MVP) — Docker compose                       │
│                                                         │
│   [aura-app]   :3000  Bun/Node — TanStack + Hono Aura  │
│   [postgres]   :5432  PostgreSQL 15 + pgvector + bdr   │
│   [redis]      :6379  Cache + queue + rate-limit       │
│   [evolution]  :8080  Evolution_API + Baileys session  │
│   [grafana]    :3001  Dashboards Prometheus (optional) │
│                                                         │
│  Backups quotidiens → S3-compatible (MinIO/Wasabi)     │
└─────────────────────────────────────────────────────────┘
```

En phase 2/3, la couche `aura-app` peut se scinder en plusieurs conteneurs :
- `aura-web` (TanStack Start + Hono bridge) horizontalement scalable.
- `aura-worker` (Outbox processor + LangGraph Agent_User + Orchestrateur Matching).
- `aura-embedding` (worker dédié génération embeddings + RAG indexation).

---

## Architecture en couches

L'architecture se décompose en **sept couches** logiques qui correspondent aux requirements fonctionnels et qui peuvent évoluer indépendamment. Chaque couche s'appuie explicitement sur les primitives Aura.

### Couche 1 — Transport WhatsApp

**Responsabilité** : recevoir les messages WhatsApp entrants, envoyer les réponses sortantes, gérer la liaison par numéro, et abstraire la transition de Baileys (MVP) vers WhatsApp Business API (phase 2 obligatoire avant la monétisation, cf. R37).

**Service** : `InboxService` (`src/operations/_services/inbox-service.ts`) → étend `AuraService`, expose `processIncoming(inboxId)`, `sendMessage(phone, body)`.

```
┌─────────────────────────────────────────────────────────────┐
│  Couche Transport WhatsApp                                  │
│                                                             │
│   Interface WhatsAppGateway                                 │
│   ├─ sendText(to, body, idempotencyKey)                     │
│   ├─ sendTemplate(to, templateName, vars)                   │
│   ├─ getPresence(phoneE164)                                 │
│   └─ verifyWebhookSignature(headers, raw)                   │
│                                                             │
│   Implémentations:                                          │
│     [BaileysGateway]              ──► Evolution_API REST    │
│     [WhatsAppBusinessGateway]     ──► Graph API Meta v22.x  │
│                                                             │
│   Sélection runtime:                                        │
│     BUSINESS_PHASE = "mvp"        → BaileysGateway          │
│     BUSINESS_PHASE = "freemium"   → WhatsAppBusinessGateway │
│     dual-write transition         → both (BaileysGateway    │
│                                       en lecture, WAB en   │
│                                       écriture)            │
└─────────────────────────────────────────────────────────────┘
```

#### Webhook entrant (`POST /webhooks/whatsapp`)

Implémenté comme `defineHttpAction("/webhooks/whatsapp", "POST")` (cf. Aura design Decision 15) avec :

1. **Validation HMAC** de la signature Evolution_API (`X-Evolution-Signature`) ou Meta (`X-Hub-Signature-256`).
2. **Parse strict** via `parseWhatsAppMessage` (cf. R48) — le payload brut est conservé en `whatsapp_inbox` pendant 30 jours pour debug.
3. **Idempotence** par `messages.providerMessageId` (clé unique).
4. **Persistance** du payload canonique dans `WhatsappInbox` avec idempotence par `providerMessageId`.
5. **Planification** immédiate de `agent.process-incoming` via `ctx.scheduler.runAfter(0, ...)`, puis **ACK 200 immédiat** (sous 200 ms) pour éviter les retries Evolution_API.

#### Sortie messages (Evolution_API client)

```
┌──────────────────────────────────────────────────────────┐
│  WhatsAppOutbox (Aura outbox + scheduler)                │
│                                                          │
│   1. Append AuraOutboxEvent type=whatsapp.send           │
│      payload = { to, body, idempotencyKey, gateway }     │
│   2. processOutboxEvents() pioche la ligne               │
│   3. Appel WhatsAppGateway.sendText()                    │
│   4. Sur succès → Outbox.SUCCEEDED                       │
│   5. Sur échec → backoff exponentiel (1s, 2s, 4s, 8s,    │
│      16s, 32s) jusqu'à maxAttempts=6                     │
│   6. Sur échec définitif → notification Admin            │
└──────────────────────────────────────────────────────────┘
```

L'idempotence est garantie côté Evolution_API par l'`idempotencyKey` (UUID v7 par message logique). Côté WhatsApp Business API, on utilise `messaging_product=whatsapp` + `to` + un `biz_opaque_callback_data` traçable.

#### Liaison numéro (R2)

```
flux liaison:
  Dashboard_Web génère link_code (8 alphanum) → users.linkCode + linkCodeExpiresAt = now()+30min
  Bot reçoit message via webhook
  ConversationNode détecte "code de liaison probable" (regex ^[A-Z0-9]{8}$)
  Si match en base et non expiré:
    - users.whatsappLinked = true
    - phoneE164 → users.whatsappE164
    - linkCode invalidé
    - Bot répond message bienvenue persona
  Sinon: réponse explicite "code invalide / expiré" dans la langue détectée
```

#### Stratégie de migration Baileys → WhatsApp Business API (R37)

```
phase mvp        : 100% BaileysGateway (1 numéro, sessions partagées)
phase shadow     : BaileysGateway en production + WhatsAppBusinessGateway en
                   shadow (dual-write outgoing, parse comparison incoming)
phase cutover    : BUSINESS_PHASE bascule à freemium → 100% WhatsAppBusinessGateway
phase rollback   : flag inversable sous 5 min si incident détecté
```

La couche `WhatsAppGateway` rend l'application aveugle à l'implémentation : seul le module `transport/whatsapp/factory.ts` lit `BUSINESS_PHASE` et instancie le bon driver.

---

### Couche 2 — Instance IA (Graphe_Agent_User)

**Responsabilité** : pour chaque utilisateur lié, exécuter le tour conversationnel avec une persona hybride et adaptative (R11), un dialogue multilingue (R12), une hydratation contextuelle (R13), une détection d'intention de matching (R14) et une présentation des résultats (R15). Cette couche sert à la fois le webhook WhatsApp, le chat Orya web et le labo de simulation.

**Service** : `UserAgentService` (`src/operations/_services/user-agent-service.ts`) → étend `AuraService`, expose `processMessage(userId, text): reply`, `processMessageWithTrace(userId, text)` et `processTurn(userId, text): OryaTurnResult`. Utilise `ctx.agent.generateText()` en interne et sert `agent.chat-with-orya`, `agent.chat-dev` et `InboxService`.

```
┌────────────────────────────────────────────────────────────────┐
│ Graphe_Agent_User (LangGraph par user_id)                      │
│                                                                │
│   START                                                        │
│     │                                                          │
│     ▼                                                          │
│   [HydrationNode] ──── charge profile + services + lang pref   │
│     │                  depuis snapshot Postgres (R13)          │
│     ▼                                                          │
│   [ConversationNode] ── génère réponse texte normale (FR/EN)   │
│     │                   appel LLM avec system persona R11      │
│     │                                                          │
│     ├──── intent ≠ matching ──┐                                │
│     │                         │                                │
│     ▼                         │                                │
│   [ExtractionNode] ───────────┤  extrait entités/relations     │
│     │  (structured output)    │  pour Knowledge Graph (R18)    │
│     │                         │                                │
│     ▼                         │                                │
│   [MatchingIntentNode] ───────┤  classifie chat | recherche    │
│     │                         │  prestataire | recherche       │
│     │                         │  connexion | aide | gestion    │
│     │                         │                                │
│     ├──── intent = matching ──┐                                │
│     │                         │                                │
│     ▼                         │                                │
│   [OrchestratorCallNode] ─────┤  invoque Orchestrateur_        │
│     │  (tool call)            │  Matching avec contraintes     │
│     │                         │  extraites (R14)               │
│     │                         │                                │
│     └─────────────────────────┘                                │
│                  │                                             │
│                  ▼                                             │
│            [ResponseNode] ◀──── persona guardrail (R11.4)      │
│                  │                                             │
│                  ▼                                             │
│                 END                                            │
│                                                                │
│   Persistence : agent_states (PRIMARY KEY user_id)            │
│   Checkpoint  : à chaque transition de node                    │
└────────────────────────────────────────────────────────────────┘
```

Le détail des nodes (contrats, prompts, transitions) est en section **Conception des Instances LangGraph** plus bas.

---

### Couche 2 bis — Dev Sandbox / Orya Lab

**Responsabilité** : fournir une surface de validation manuelle multi-profils sans WhatsApp réel, tout en réutilisant les mêmes services métier que la production. Cette couche répond à R51-R52 et évite toute divergence entre les démonstrations et le pipeline réel.

**Service** : `DevLabService` (`src/operations/_services/dev-lab-service.ts`) → étend `AuraService`, expose `chat(phoneE164, text)`, `getState(phoneE164)`, `actOnMatch(phoneE164, matchId, action)` et `sendConversationMessage(phoneE164, conversationId, body)`.

```
┌────────────────────────────────────────────────────────────────┐
│ Dev_Sandbox_Orya_Lab                                          │
│                                                                │
│   profils seedes  ──▶ agent.chat-dev ──▶ UserAgentService      │
│          │                              │                      │
│          │                              ├─▶ MatchingService    │
│          │                              ├─▶ MatchService       │
│          │                              └─▶ ChatService        │
│          │                                                     │
│          └──────────────▶ agent.dev-lab-state                  │
│                              retourne: profil, matchs,         │
│                              conversations, événements, trace   │
└────────────────────────────────────────────────────────────────┘
```

Les opérations du labo sont `public()` mais strictement réservées aux environnements non production ; elles doivent lever `AuraError("FORBIDDEN")` si `NODE_ENV === "production"`.

---

### Couche 3 — Orchestrateur Matching

**Responsabilité** : résoudre une requête de mise en relation par fusion Graph_Traversal + Embedding_Query, application de Diversity_Mix, filtrage et caching Redis. Indépendant de la couche conversationnelle pour pouvoir être optimisé seul (latence cible 1-2 s p95, R41). Le moteur reste **retrieval-first** : le ranking métier est produit ici, puis seulement reformulé par l'agent utilisateur.

**Service** : `MatchingService` (`src/operations/_services/matching-service.ts`) → étend `AuraService`, expose `findMatches(requesterId, constraints): MatchingResult`. Utilise `this.paginate()`, `this.runQuery()`, et le Knowledge Graph. Appelé par `UserAgentService` via tool call.

```
┌────────────────────────────────────────────────────────────────┐
│ Orchestrateur_Matching (LangGraph séparé)                      │
│                                                                │
│   START                                                        │
│     │                                                          │
│     ▼                                                          │
│   [ReceiveRequest] ──── normalise contraintes:                 │
│     │                   { skills, location, industry, need,    │
│     │                     budget, region, requesterId }        │
│     │                   calcule queryHash pour cache            │
│     ▼                                                          │
│   [CacheLookup]                                                │
│     │                                                          │
│     ├── HIT ───────────────────────────────────▶ [Return]     │
│     │                                                          │
│     ▼ MISS                                                     │
│                                                                │
│   ┌─────────── parallèle ────────────┐                         │
│   │                                  │                         │
│   ▼                                  ▼                         │
│ [GraphTraversal]               [EmbeddingQuery]                │
│   CTE récursive sur            pgvector HNSW cosine            │
│   entities/relations            sur graph_embeddings           │
│   profondeur 1-3                top-50 candidats               │
│   top-50 candidats              filtres region+status          │
│   timeout 800 ms                timeout 300 ms                 │
│   │                                  │                         │
│   └──────────┬───────────────────────┘                         │
│              │                                                 │
│              ▼                                                 │
│   [HybridScoring] ─── RRF fusion (k=60)                       │
│     │                  + bonus Badge_Verifie ×1.10            │
│     │                  + slot Boost réservé top 3              │
│     ▼                                                          │
│   [Filter] ─────── exclusions (déjà matché < 30j, suspendu,    │
│     │              bloqué, soi-même)                           │
│     ▼                                                          │
│   [Diversity] ──── 60% high score / 30% mid / 10% wildcard     │
│     │                                                          │
│     ▼                                                          │
│   [CacheStore] ── TTL 60 s, key = (user, queryHash, region)    │
│     │                                                          │
│     ▼                                                          │
│   [Return] ─── { matchSessionId, profiles[], scoreDetail[] }  │
│                                                                │
│   Persistence: chaque session loggée dans match_sessions       │
└────────────────────────────────────────────────────────────────┘
```

Les algorithmes Graph_Traversal, RRF, Diversity_Mix sont détaillés en section **Conception du système Graph RAG**.

---

### Couche 4 — Knowledge Graph

**Responsabilité** : stocker les entités et relations extraites (R17, R18), permettre le traversal performant (R19), maintenir les embeddings synchronisés (R20, R22), garantir le round-trip de sérialisation (R23).

**Service** : `KnowledgeGraphService` (`src/operations/_services/knowledge-graph-service.ts`) → étend `AuraService`, expose `upsertEntity(userId, type, value)`, `upsertRelation(sourceId, targetId, predicate)`, `traverse(constraints): Candidate[]`, `regenerateEmbedding(entityId)`.

```
┌──────────────────────────────────────────────────────────────┐
│ Knowledge Graph                                              │
│                                                              │
│   Tables PostgreSQL:                                         │
│                                                              │
│   ┌─────────────────────────────────────────────┐            │
│   │  entities                                   │            │
│   │   id PK | user_id | type | value |          │            │
│   │   confidence | status | source |            │            │
│   │   embedding_id | created_at                 │            │
│   │   indices: (user_id, type), (type, value)   │            │
│   │           gin(metadata)                     │            │
│   └─────────────────────────────────────────────┘            │
│                                                              │
│   ┌─────────────────────────────────────────────┐            │
│   │  relations                                  │            │
│   │   id PK | source_entity_id | target_entity  │            │
│   │   _id | predicate | strength | source |     │            │
│   │   created_at                                │            │
│   │   indices: (predicate, source_entity_id),   │            │
│   │           (predicate, target_entity_id)     │            │
│   └─────────────────────────────────────────────┘            │
│                                                              │
│   ┌─────────────────────────────────────────────┐            │
│   │  graph_embeddings  (pgvector HNSW)          │            │
│   │   id PK | entity_id FK | embedding(1536)    │            │
│   │   metadata jsonb | updated_at               │            │
│   │   indices: hnsw(embedding vector_cosine_ops)│            │
│   │           (entity_id), gin(metadata)        │            │
│   └─────────────────────────────────────────────┘            │
│                                                              │
│   Workflows associés:                                        │
│     graph.regenerate-embedding         (scheduler retry)     │
│     graph.consolidate-entities         (cron quotidien)      │
│     graph.refresh-materialized-views   (cron horaire)        │
└──────────────────────────────────────────────────────────────┘
```

Le détail du modèle d'entités (sous-types Zod par `type`) et du modèle de relations (sémantique par `predicate`) est en section **Conception du système Graph RAG**.

---

### Couche 5 — Chat Temps Réel

**Responsabilité** : transporter en temps réel les messages des Conversation_Anonyme via Aura broadcast WebSocket (R26), gérer la latence < 500 ms (R27), notifier WhatsApp en cas d'absence (R16, R26.5), capturer les snapshots de Disputes (R9).

**Service** : `ChatService` (`src/operations/_services/chat-service.ts`) → étend `AuraService`, expose `sendMessage(userId, conversationId, body): Message`, `markRead(userId, conversationId, messageId)`. Publie les événements `message:new` sur la room WS `conversation:{id}`. Notifie via `ctx.notify.via("new-message").send({...})` pour les notifications offline.

```
┌──────────────────────────────────────────────────────────┐
│ Couche Chat                                              │
│                                                          │
│   Aura broadcast rooms:                                  │
│     conversation:{conversationId}   ─ messages chat      │
│     user:{userId}                  ─ compteurs non lus   │
│     admin:disputes                 ─ alertes mod.        │
│                                                          │
│   Flux d'un message:                                     │
│                                                          │
│   client A ─▶ POST /aura/chat.send-message              │
│     │                                                    │
│     ▼                                                    │
│   mutation persiste row dans `messages`                  │
│     │                                                    │
│     ▼                                                    │
│   broadcast event `message:new`                          │
│     ├─▶ room conversation:{id} (recipients en ligne)     │
│     └─▶ room user:{recipientId} (badge non lu)           │
│                                                          │
│     Si recipient hors-ligne (présence WS):               │
│       └─▶ enqueue AuraOutboxEvent type=whatsapp.notify  │
│           agrégation 60 s même conversation (R16.4)      │
│                                                          │
│   Présence et lecture:                                   │
│     event `presence:online | presence:offline`           │
│     event `message:read` { conversationId, messageId }   │
│       met à jour `messages.readAt`                       │
└──────────────────────────────────────────────────────────┘
```

Le double opt-in (R24) est porté par le workflow `match.acceptance` qui crée la Conversation_Anonyme atomiquement (création row + révélation photos via `ctx.storage.grantAccess`).

---

### Couche 6 — Paiement (PaymentProvider abstrait)

**Responsabilité** : abstraire les fournisseurs de paiement derrière une interface stable (R28), traiter les webhooks signés et idempotents (R29), gérer les workflows d'activation et de renouvellement (R31, R34), préparer l'Escrow phase 3 (R33).

**Service** : `PaymentService` (`src/operations/_services/payment-service.ts`) → étend `AuraService`, expose `initiateCheckout(userId, kind): Payment`, `handleWebhook(provider, payload)`, `refund(paymentId)`. Utilise `PaymentProvider` interface (Fapshi/Flutterwave). Envoie les confirmations via `ctx.notify.via("payment-success").send({...})`.

```
┌──────────────────────────────────────────────────────────┐
│ Couche Paiement                                          │
│                                                          │
│   Interface PaymentProvider:                             │
│     initiatePayment(input)         ── Promise<Init>      │
│     verifyWebhookSignature(req)    ── boolean            │
│     getPaymentStatus(transId)      ── Promise<Status>    │
│     refundPayment(transId, amt?)   ── Promise<Refund>    │
│                                                          │
│   Implémentations:                                       │
│     Provider_Fapshi      (MVP/phase 2 — Cameroun)        │
│     Provider_Flutterwave (phase 3 — CI/SN/BF)            │
│                                                          │
│   Routage par région:                                    │
│     payment.factory.forRegion(user.region)               │
│       CM → Provider_Fapshi                               │
│       CI/SN/BF → Provider_Flutterwave                    │
│                                                          │
│   Workflows:                                             │
│     payment.activate-product  (Badge | Boost | Pro)      │
│     payment.renew-subscription(scheduler 30j)            │
│     escrow.lifecycle          (held → released/refunded) │
│                                                          │
│   Webhooks Hono:                                         │
│     POST /webhooks/fapshi       (HMAC + idempotence)     │
│     POST /webhooks/flutterwave  (HMAC + idempotence)     │
└──────────────────────────────────────────────────────────┘
```

---

### Couche 7 — Observabilité IA

**Responsabilité** : tracer chaque appel LLM (R42.1), agréger les métriques business et IA (R42.2-4), exposer un dashboard Admin, propager un `correlationId` de bout en bout (R45.2).

**Service** : `ObservabilityService` (`src/operations/_services/observability-service.ts`) → étend `AuraService`, expose `recordLlmCall(data)`, `getBusinessMetrics(since): Metrics`, `getAiMetrics(since): AiMetrics`. Utilisé par l'Admin_Console (R10) et le dashboard admin.

```
┌──────────────────────────────────────────────────────────┐
│ Couche Observabilité                                     │
│                                                          │
│   Tables:                                                │
│     llm_calls       ── 1 ligne par appel LLM             │
│     match_sessions  ── 1 ligne par session matching      │
│     AuraAuditLog    ── (existant) actions sensibles      │
│                                                          │
│   Tracing:                                               │
│     correlationId UUID v7 généré par Webhook_WhatsApp    │
│     propagé dans Graphe_Agent_User → Orchestrateur →    │
│     Notification → llm_calls.correlation_id              │
│                                                          │
│   Métriques Prometheus (R45.3):                          │
│     aura_whatsapp_messages_total{direction,status}       │
│     aura_bot_latency_seconds{phase}                      │
│     aura_match_latency_seconds{node}                     │
│     aura_llm_tokens_total{model,node}                    │
│     aura_llm_cost_usd_total{model}                       │
│     aura_match_quality_ratio (rolling 30j)               │
│     aura_outbox_queue_depth                              │
│                                                          │
│   Dashboards Admin_Console:                              │
│     - Tokens / day / model (Recharts AreaChart)          │
│     - Coût USD / day (Recharts BarChart)                 │
│     - Latence p50/p95/p99 par node                       │
│     - Qualité match (notes >= 4 / total)                 │
│     - Disputes ouvertes / résolues                       │
└──────────────────────────────────────────────────────────┘
```

---

## Composants et Interfaces

Cette section liste les modules applicatifs (operations, agents, workflows, http actions) à créer dans `src/operations/` selon les conventions kebab-case d'Aura. Le détail des contrats (input Zod, output Zod, entities) est défini ici ; l'implémentation est laissée aux tasks.

### Inventaire des operations Aura

Les operations sont des thin handlers qui délèguent aux Services dans `src/operations/_services/`.

```
src/operations/
├── _services/                           # ← Business logic layer (AuraService)
│   ├── inbox-service.ts                 #   Couche 1 — Transport WhatsApp
│   ├── user-agent-service.ts            #   Couche 2 — Graphe_Agent_User
│   ├── matching-service.ts              #   Couche 3 — Orchestrateur Matching
│   ├── knowledge-graph-service.ts       #   Couche 4 — Knowledge Graph
│   ├── chat-service.ts                  #   Couche 5 — Chat temps réel
│   ├── payment-service.ts               #   Couche 6 — Paiement
│   └── alias-service.ts                 #   Génération d'alias
│
├── _middleware/
│   ├── with-region-filter.middleware.ts    ── injecte ctx.region
│   ├── with-active-profile.middleware.ts   ── exige profile.status=active
│   └── with-pro-quota.middleware.ts        ── enforce quotas matching
│
├── users/
│   ├── register.operation.ts          (mutate, public) — R1
│   ├── verify-email.operation.ts      (mutate, public) — R1
│   ├── generate-link-code.operation.ts (mutate, auth) — R1.3
│   ├── set-language.operation.ts      (mutate, auth) — R39.2
│   ├── set-region.operation.ts        (mutate, auth) — R40.1
│   ├── consent-record.operation.ts    (mutate, auth) — R1.5, R38.4
│   ├── data-export.action.ts          (action, auth) — R36.5
│   └── data-delete.action.ts          (action, auth) — R36.4
│
├── profiles/
│   ├── upsert.operation.ts            (mutate, auth) — R3, R4
│   ├── upload-photo.action.ts         (action, auth) — R4.4
│   ├── set-type.operation.ts          (mutate, auth) — R3.4
│   └── get-by-id.operation.ts         (query, auth)
│
├── services/
│   ├── create.operation.ts            (mutate, auth) — R5.1
│   ├── update.operation.ts            (mutate, auth) — R5.1
│   ├── deactivate.operation.ts        (mutate, auth) — R5.3
│   ├── list-mine.operation.ts         (query, auth)  — pagination R8.2
│   └── search.search.ts               (defineSearchIndex) — R20
│
├── matching/
│   ├── create-request.operation.ts    (mutate, auth) — R6.3, R15.3, R24.1
│   ├── accept-request.operation.ts    (mutate, auth) — R6.4, R24.2
│   ├── refuse-request.operation.ts    (mutate, auth) — R24.3
│   ├── cancel-request.operation.ts    (mutate, auth) — R6.3
│   ├── list-mine.operation.ts         (query, auth) — R6.1, R8
│   ├── orchestrator.action.ts         (action, internal) — invoque LangGraph
│   └── orchestrator-cache.db-read.ts  ── view (user_id, query_hash, ttl)
│
├── conversations/
│   ├── list-mine.operation.ts         (query, auth) — R8.1
│   ├── get-by-id.operation.ts         (query, auth) — R8.2
│   ├── send-message.operation.ts      (mutate, auth) — R26.3, R27
│   ├── mark-read.operation.ts         (mutate, auth)
│   ├── close.operation.ts             (mutate, auth) — R8.4
│   └── messages-paginated.db-read.ts  ── pagination cursor R8.2
│
├── ratings/
│   ├── submit.operation.ts            (mutate, auth) — R7.1, R7.5
│   └── stats-by-user.db-read.ts       ── moyenne agrégée R7.2
│
├── disputes/
│   ├── report.operation.ts            (mutate, auth) — R9.1
│   ├── list-pending.operation.ts      (query, admin) — R10.2
│   ├── resolve.operation.ts           (mutate, admin) — R9.3
│   └── snapshot-builder.action.ts     (action, internal) — capture R9.1
│
├── admin/
│   ├── suspend-user.operation.ts      (mutate, admin) — R9.6
│   ├── unsuspend-user.operation.ts    (mutate, admin) — R10.3
│   ├── metrics-business.operation.ts  (query, admin) — R10.4
│   └── metrics-ai.operation.ts        (query, admin) — R10.5, R42
│
├── payments/
│   ├── initiate-badge.action.ts       (action, auth) — R31.1
│   ├── initiate-boost.action.ts       (action, auth) — R31.2
│   ├── initiate-pro.action.ts         (action, auth) — R31.3
│   ├── refund.action.ts               (action, admin) — R32.5, R33.5
│   └── list-history.operation.ts      (query, auth)
│
├── subscriptions/
│   ├── status.operation.ts            (query, auth)
│   ├── cancel.operation.ts            (mutate, auth) — R34.4
│   └── renew-charge.cron.ts           (cron) — R34.2
│
├── notifications/                       # defineNotificationFn — voir § Notifications
│   ├── match-request.notification.ts    (notif) — R6.2, R16
│   ├── match-accepted.notification.ts   (notif) — R6.4, R16.2
│   ├── match-refused.notification.ts    (notif) — R16.2
│   ├── new-message.notification.ts      (notif) — R16.1
│   ├── payment-success.notification.ts  (notif) — R16.3, R31
│   ├── warning.notification.ts          (notif) — R9.4
│   └── suspension.notification.ts       (notif) — R9.5
│
│   # Dispatch via ctx.notify.via("match-accepted").send({...})
│
├── graph/
│   ├── upsert-entity.operation.ts     (mutate, internal) — R17, R18
│   ├── upsert-relation.operation.ts   (mutate, internal) — R17.2
│   ├── regenerate-embedding.action.ts (action, internal) — R22.2
│   ├── traverse.db-read.ts            ── CTE récursive R19.2
│   ├── search-vector.action.ts        (action, internal) — R20.1
│   └── refresh-views.cron.ts          ── (cron) — materialized views
│
├── webhooks/
│   ├── whatsapp.http.ts               (defineHttpAction POST) — R29 like
│   ├── fapshi.http.ts                 (defineHttpAction POST) — R29
│   └── flutterwave.http.ts            (phase 3)
│
├── ai/
│   ├── agent-user.agent.ts            (defineAgent) — Graphe_Agent_User
│   ├── orchestrator-matching.workflow.ts (defineWorkflow) — LangGraph séparé
│   ├── persona-prompts.ts             — system prompts FR/EN
│   └── extraction-schemas.ts          — Zod sortie ExtractionNode
│
├── workflows/
│   ├── verify-identity.workflow.ts    (defineWorkflow) — R32
│   ├── escrow-lifecycle.workflow.ts   (defineWorkflow) — R33
│   ├── data-export.workflow.ts        (defineWorkflow) — R36.5
│   └── data-delete.workflow.ts        (defineWorkflow) — R36.4
│
└── analytics/
    ├── llm-call.operation.ts          (mutate, internal) — log R42.1
    └── match-session.operation.ts     (mutate, internal) — log R42.3
```

### Interfaces transverses (TypeScript)

#### `WhatsAppGateway`

```ts
// src/aura/server/transport/whatsapp/types.ts
export interface WhatsAppGateway {
  sendText(input: {
    to: string;                  // E.164 sans "+"
    body: string;
    idempotencyKey: string;      // UUID v7
  }): Promise<{ providerMessageId: string }>;

  sendTemplate(input: {
    to: string;
    templateName: string;
    languageCode: "fr" | "en";
    components: TemplateComponent[];
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string }>;

  verifyWebhookSignature(input: {
    headers: Headers;
    rawBody: string;
  }): boolean;

  parseInbound(rawBody: string): WhatsAppInboundPayload;
}
```

Deux implémentations : `BaileysGateway` (HTTP vers Evolution_API) et `WhatsAppBusinessGateway` (Graph API Meta). Sélection runtime via `WhatsAppGatewayFactory.forPhase(BUSINESS_PHASE)`.

#### `PaymentProvider`

```ts
// src/aura/server/payments/types.ts
export interface PaymentProvider {
  readonly name: "fapshi" | "flutterwave";
  readonly supportedRegions: readonly Region[];

  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyWebhookSignature(input: { headers: Headers; rawBody: string }): boolean;
  getPaymentStatus(input: { providerTransId: string }): Promise<PaymentStatus>;
  refundPayment(input: { providerTransId: string; amount?: number }): Promise<RefundResult>;
}
```

Schémas Zod associés (`InitiatePaymentInput`, `PaymentStatus`, `RefundResult`) déclarés dans `src/aura/server/payments/schemas.ts`.

#### `MatchingRequest` / `MatchingResult`

```ts
// src/operations/matching/types.ts
import { z } from "zod";

export const MatchingRequestSchema = z.object({
  requesterId: z.string().uuid(),
  region: z.string().length(2),
  intent: z.enum(["recherche-prestataire", "recherche-connexion"]),
  constraints: z.object({
    skills: z.array(z.string()).default([]),
    location: z.string().optional(),
    industry: z.string().optional(),
    needs: z.array(z.string()).default([]),
    budgetMin: z.number().int().nonnegative().optional(),
    budgetMax: z.number().int().nonnegative().optional(),
    expandRegion: z.boolean().default(false),
  }),
  correlationId: z.string().uuid(),
});

export const MatchingResultSchema = z.object({
  matchSessionId: z.string().uuid(),
  profiles: z.array(z.object({
    userId: z.string().uuid(),
    alias: z.string(),
    summary: z.string().max(280),
    services: z.array(z.string().max(120)).max(5),
    score: z.number().min(0).max(1),
    scoreDetail: z.object({
      graphRank: z.number().int().nullable(),
      vectorRank: z.number().int().nullable(),
      rrfScore: z.number(),
      badgeBonus: z.number(),
      boostSlot: z.boolean(),
    }),
    bucket: z.enum(["high", "mid", "wildcard", "boost"]),
  })).max(5),
});
```

#### `LLMProvider` (R43)

```ts
// src/aura/server/ai/llm-provider.ts
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  invoke(messages: Message[], opts?: InvokeOptions): Promise<LLMResponse>;
  stream(messages: Message[], opts?: InvokeOptions): AsyncIterable<LLMTokenDelta>;
  health(): Promise<{ ok: boolean; latencyMs: number }>;
}

export type LLMNode = "Conversation" | "Extraction" | "MatchingIntent" | "Response";

export interface LLMRouter {
  forNode(node: LLMNode): LLMProvider;          // override par node
  fallback(): LLMProvider;                       // provider de secours
}
```

L'ensemble s'appuie sur LangChain JS comme couche d'abstraction conformément à la décision Aura 24 et au requirement R43. Le routage par node est lu depuis `aura.config.ts` (`ai.routing.byNode`).

---

## Modèle de données

Cette section étend le schéma Prisma existant (cf. `prisma/schema.prisma`, models Aura déjà présents : `AuraUser`, `AuraSession`, `AuraOutboxEvent`, etc.) avec les tables métier, Graph RAG et observabilité. Les conventions :

- Toutes les nouvelles tables utilisent `String @id @default(cuid())` pour cohérence avec Aura.
- Les FK utilisent `onDelete: Cascade` sauf indication contraire.
- Les index `pgvector` HNSW sont déclarés en SQL via migration custom (Prisma ne supporte pas encore HNSW natif).
- Les enums sont déclarés en Prisma pour bénéficier du typage côté client généré.

### Vue d'ensemble des tables ajoutées

```
[Aura existant]                  [Métier]                   [Graph RAG]
───────────────                  ──────────                 ───────────
AuraUser                         profiles                   entities
AuraSession                      services                   relations
AuraPhoneIdentity                match_requests             graph_embeddings
AuraPasswordCredential           conversations
AuraOtpChallenge                 messages                   [Observabilité]
AuraNotification                 ratings                    ─────────────
AuraOutboxEvent                  disputes                   llm_calls
AuraJobRun                       payments                   match_sessions
AuraAuditLog                     subscriptions              agent_states
AuraFile                         consents                   whatsapp_inbox
AuraRateLimitBucket              boosts                     business_config
                                 mission_escrows (phase 3)
```

### Enums Prisma

```prisma
enum BusinessPhase { mvp freemium commission }

enum Region { CM CI SN BF GA TG BJ NE TD CG }   // ISO 3166-1 alpha-2

enum Language { fr en }

enum ProfileType { user_standard prestataire }

enum ProfileStatus { active suspended pending_review deleted }

enum ServiceAvailability { available busy unavailable }

enum MatchRequestStatus { pending accepted refused expired cancelled }

enum ConversationStatus { open closed disputed }

enum MessageKind { text system reveal_photo dispute_marker }

enum DisputeStatus { open under_review resolved }
enum DisputeDecision { dismiss warn_reporter warn_reported warn_both suspend_reported suspend_both }

enum PaymentType { badge boost pro commission escrow }
enum PaymentStatusEnum { pending succeeded failed refunded }
enum PaymentProviderName { fapshi flutterwave }

enum SubscriptionPlan { pro }
enum SubscriptionStatus { active expired cancelled past_due }

enum EntityType { user service skill location industry need }
enum EntitySource { conversation dashboard }
enum EntityStatus { active pending_review archived }

enum RelationPredicate { provides requires located_in looks_for matches connected_to rated }
enum RelationSource { conversation dashboard rating }

enum AgentNode { hydration conversation extraction matching_intent orchestrator_call response }

enum LlmNode { Conversation Extraction MatchingIntent Response }
```

### Schéma — Métier (extension `profiles`)

```prisma
model profiles {
  id              String        @id @default(cuid())
  userId          String        @unique
  user            AuraUser      @relation(fields: [userId], references: [id], onDelete: Cascade)

  type            ProfileType   @default(user_standard)
  name            String?       @db.VarChar(80)
  alias           String        @unique               // adjectif-nom-1234, R25.5
  bio             String?       @db.VarChar(1000)
  photoStorageId  String?                              // ctx.storage R4.4
  language        Language      @default(fr)
  region          Region                                // R40.1
  location        String?       @db.VarChar(160)
  skills          String[]      @default([])
  status          ProfileStatus @default(active)
  isVerified      Boolean       @default(false)        // R31.4 Badge_Verifie
  warningCount    Int           @default(0)            // R9.4-9.5
  whatsappOptIn   Boolean       @default(true)         // R16.5

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  services        services[]
  matchRequestsSent     match_requests[] @relation("MatchRequestRequester")
  matchRequestsReceived match_requests[] @relation("MatchRequestTarget")

  @@index([region, status])
  @@index([type, status])
  @@index([isVerified])
}
```

Index supplémentaires en SQL (migration custom) :
```sql
-- Full-text search FR/EN sur bio + skills (R20)
ALTER TABLE profiles ADD COLUMN search_vector_fr tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce(bio, '')), 'A') ||
    setweight(to_tsvector('french', array_to_string(skills, ' ')), 'B')
  ) STORED;
ALTER TABLE profiles ADD COLUMN search_vector_en tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(bio, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(skills, ' ')), 'B')
  ) STORED;
CREATE INDEX profiles_search_fr_idx ON profiles USING GIN (search_vector_fr);
CREATE INDEX profiles_search_en_idx ON profiles USING GIN (search_vector_en);
```

### Schéma — Services

```prisma
model services {
  id              String              @id @default(cuid())
  profileId       String
  profile         profiles            @relation(fields: [profileId], references: [id], onDelete: Cascade)

  title           String              @db.VarChar(120)
  description     String              @db.VarChar(2000)
  priceFcfa       Int                                    // R5.1 entier positif
  availability    ServiceAvailability @default(available)
  zone            String?             @db.VarChar(160)
  isActive        Boolean             @default(true)
  embeddingStale  Boolean             @default(false)    // R22.5 retry échec

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([profileId, isActive])
  @@index([availability, isActive])
  @@index([priceFcfa])
}
```

Full-text idem `profiles`. Quota 50 services actifs / prestataire enforced en application (`with-pro-quota.middleware.ts`, R5.4).

### Schéma — Match Requests, Conversations, Messages

```prisma
model match_requests {
  id            String              @id @default(cuid())
  requesterId   String
  requester     profiles            @relation("MatchRequestRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  targetId      String
  target        profiles            @relation("MatchRequestTarget", fields: [targetId], references: [id], onDelete: Cascade)

  matchSessionId String?                                  // session orchestrator d'origine
  intent        String                                    // recherche-prestataire | recherche-connexion
  message       String?             @db.VarChar(280)      // message d'introduction optionnel

  status        MatchRequestStatus  @default(pending)
  expiresAt     DateTime                                  // R24.5 14 jours
  decidedAt     DateTime?
  conversationId String?            @unique               // créée à acceptation

  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  conversation  conversations?      @relation(fields: [conversationId], references: [id])

  @@unique([requesterId, targetId, status], name: "uniq_pending_match")
  @@index([targetId, status, createdAt])
  @@index([requesterId, status, createdAt])
  @@index([expiresAt, status])
}

model conversations {
  id              String              @id @default(cuid())
  participantAId  String                                    // alphabétiquement plus petit user_id
  participantBId  String
  status          ConversationStatus  @default(open)
  lastMessageAt   DateTime            @default(now())
  closedAt        DateTime?
  closeReason     String?

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  matchRequest    match_requests?
  messages        messages[]
  ratings         ratings[]
  disputes        disputes[]

  @@unique([participantAId, participantBId])
  @@index([participantAId, status, lastMessageAt])
  @@index([participantBId, status, lastMessageAt])
}

model messages {
  id                String          @id @default(cuid())
  conversationId    String
  conversation      conversations   @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderId          String
  kind              MessageKind     @default(text)
  body              String          @db.VarChar(4000)     // R27.2
  metadata          Json?
  readAt            DateTime?
  createdAt         DateTime        @default(now())

  // Pour idempotence des envois (R49.1)
  idempotencyKey    String?         @unique

  @@index([conversationId, createdAt])
  @@index([senderId, createdAt])
}
```

### Schéma — Ratings, Disputes

```prisma
model ratings {
  id              String          @id @default(cuid())
  conversationId  String
  conversation    conversations   @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  raterId         String                                  // profiles.id
  ratedId         String                                  // profiles.id
  score           Int                                      // 1..5 (CHECK en migration)
  comment         String?         @db.VarChar(500)
  createdAt       DateTime        @default(now())

  @@unique([conversationId, raterId], name: "uniq_rating_per_conversation")
  @@index([ratedId, createdAt])
}

model disputes {
  id              String          @id @default(cuid())
  conversationId  String
  conversation    conversations   @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  reporterId      String
  reportedId      String
  reason          String          @db.VarChar(120)
  reasonDetail    String?         @db.VarChar(1000)
  snapshot        Json                                    // R9.1 snapshot complet immuable
  status          DisputeStatus   @default(open)
  decision        DisputeDecision?
  decisionNote    String?         @db.VarChar(2000)
  decidedById     String?                                 // AuraUser.id de l'admin
  decidedAt       DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status, createdAt])
  @@index([reporterId, createdAt])
}
```

### Schéma — Paiements, Boosts, Subscriptions

```prisma
model payments {
  id                String              @id @default(cuid())
  userId            String
  type              PaymentType
  provider          PaymentProviderName
  providerTransId   String              @unique          // R29.5 idempotence
  amount            Int                                  // FCFA
  currency          String              @default("XAF")  // XAF | XOF
  status            PaymentStatusEnum   @default(pending)
  metadata          Json?
  initiatedAt       DateTime            @default(now())
  succeededAt       DateTime?
  refundedAt        DateTime?
  refundedAmount    Int?

  // Idempotence côté client (R49.1)
  idempotencyKey    String?             @unique

  @@index([userId, createdAt(sort: Desc) -> [createdAt]])
  @@index([provider, providerTransId])
  @@index([status, type])
  @@map("payments")
}

model boosts {
  id        String   @id @default(cuid())
  userId    String                                     // profiles.userId
  paymentId String   @unique
  startsAt  DateTime
  endsAt    DateTime                                   // R31.2 starts+7j
  active    Boolean  @default(true)

  @@index([userId, active, endsAt])
}

model subscriptions {
  id          String              @id @default(cuid())
  userId      String              @unique
  plan        SubscriptionPlan    @default(pro)
  status      SubscriptionStatus  @default(active)
  startsAt    DateTime            @default(now())
  endsAt      DateTime
  cancelledAt DateTime?
  lastPaymentId String?

  @@index([status, endsAt])
}
```

### Schéma — Graph RAG

```prisma
model entities {
  id            String         @id @default(cuid())
  userId        String?                                  // peut être null pour entités globales (Industry "tech")
  type          EntityType
  value         String         @db.VarChar(160)
  normalized    String         @db.VarChar(160)          // value lowercased + sans diacritiques pour dédup
  confidence    Float          @default(1.0)             // 0..1, R17.1
  status        EntityStatus   @default(active)          // R17.5 pending_review si confidence<0.5
  source        EntitySource
  metadata      Json?
  embeddingId   String?        @unique
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  embedding     graph_embeddings? @relation(fields: [embeddingId], references: [id])

  outgoing      relations[]    @relation("RelationSource")
  incoming      relations[]    @relation("RelationTarget")

  @@unique([userId, type, normalized], name: "uniq_entity_per_user")
  @@index([type, normalized])
  @@index([userId, type])
  @@index([status, type])
}

model relations {
  id              String              @id @default(cuid())
  sourceEntityId  String
  source          entities            @relation("RelationSource", fields: [sourceEntityId], references: [id], onDelete: Cascade)
  targetEntityId  String
  target          entities            @relation("RelationTarget", fields: [targetEntityId], references: [id], onDelete: Cascade)
  predicate       RelationPredicate
  strength        Float               @default(0.5)       // 0..1, R17.2
  source_         RelationSource      @map("source")
  metadata        Json?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([sourceEntityId, targetEntityId, predicate], name: "uniq_relation")
  @@index([predicate, sourceEntityId])
  @@index([predicate, targetEntityId])
  @@index([strength])
}

model graph_embeddings {
  id          String   @id @default(cuid())
  // Le vecteur est stocké en colonne pgvector via migration custom (Prisma ne mappe pas vector)
  // embedding vector(1536)
  metadata    Json?    // { entityId, userId, entityType, region, lang }
  updatedAt   DateTime @updatedAt
  entity      entities?

  @@index([updatedAt])
}
```

Migration custom pour pgvector :

```sql
-- 0001_init_pgvector.sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE graph_embeddings ADD COLUMN embedding vector(1536);

CREATE INDEX graph_embeddings_hnsw_cosine
  ON graph_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);                   -- R41.3

CREATE INDEX graph_embeddings_metadata_gin
  ON graph_embeddings USING GIN (metadata);
```

### Schéma — Agent state (checkpointer LangGraph)

```prisma
model agent_states {
  userId        String      @id                          // 1 ligne par utilisateur (R13.4)
  state         Json                                      // sérialisation LangGraph complète
  currentNode   AgentNode
  language      Language    @default(fr)
  lastNodeAt    DateTime    @default(now())
  version       Int         @default(1)
  checkpointId  String?                                   // pour multi-checkpoints rolling
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([currentNode, lastNodeAt])
}

model agent_state_history {
  id            String      @id @default(cuid())
  userId        String
  fromNode      AgentNode
  toNode        AgentNode
  delta         Json
  correlationId String                                    // R45.2
  createdAt     DateTime    @default(now())

  @@index([userId, createdAt])
}
```

`agent_states` sert de checkpointer LangGraph. `agent_state_history` permet l'analyse post-mortem et le replay déterministe en environnement de test.

### Schéma — Observabilité IA

```prisma
model llm_calls {
  id                String   @id @default(cuid())
  correlationId     String                                // R45.2 propagé
  userIdHash        String?                               // R42.5 HMAC stable
  node              LlmNode
  provider          String                                // "openai", "anthropic", ...
  model             String
  promptTokens      Int
  completionTokens  Int
  totalTokens       Int
  latencyMs         Int
  costUsd           Float?
  status            String                                // "ok" | "error" | "filtered" | "fallback"
  errorMessage      String?
  createdAt         DateTime @default(now())

  @@index([createdAt, node])
  @@index([model, createdAt])
  @@index([correlationId])
}

model match_sessions {
  id                  String   @id @default(cuid())
  userIdHash          String                              // demandeur hashé
  region              Region
  intent              String
  queryHash           String                              // hash des contraintes
  profilesProposed    Json                                // [{ userId, score, scoreDetail }, ...]
  profilesSelected    Json     @default("[]")             // ids choisis dans la réponse
  ratingsAfter        Json     @default("[]")             // notes ultérieures liées
  graphLatencyMs      Int
  vectorLatencyMs     Int
  rrfLatencyMs        Int
  totalLatencyMs      Int
  cacheHit            Boolean  @default(false)
  correlationId       String

  createdAt           DateTime @default(now())

  @@index([createdAt, region])
  @@index([queryHash])
  @@index([correlationId])
}

model whatsapp_inbox {
  id                String   @id @default(cuid())
  providerMessageId String   @unique                      // idempotence R49.3
  fromE164          String
  rawPayload        Json                                  // R48.5 conserver 30j
  parsedOk          Boolean
  parseError        String?
  receivedAt        DateTime @default(now())

  @@index([fromE164, receivedAt])
  @@index([receivedAt])                                   // purge cron
}
```

### Schéma — Configuration et consentements

```prisma
model business_config {
  key           String   @id                              // "BUSINESS_PHASE", "RRF_K", ...
  value         Json
  updatedById   String?
  updatedAt     DateTime @updatedAt
}

model consents {
  id            String   @id @default(cuid())
  userId        String
  scope         String                                    // "privacy_policy" | "graph_rag" | "whatsapp_communication" | "stats_aggregation"
  version       String                                    // version du document signée
  consentedAt   DateTime @default(now())
  ipHash        String?
  userAgentHash String?

  @@index([userId, scope])
}
```

### Schéma — Escrow (phase 3)

```prisma
model mission_escrows {
  id                String   @id @default(cuid())
  conversationId    String
  clientId          String
  prestataireId     String
  missionAmount     Int
  commissionRate    Decimal  @db.Decimal(4, 4)            // 0.0500..0.0800
  paymentId         String   @unique
  state             String                                // "held" | "released" | "refunded" | "disputed"
  releasedAt        DateTime?
  refundedAt        DateTime?
  disputeId         String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([state, createdAt])
}
```

### Stratégie d'indexation

| Index | Table | Justification | Requirement |
|-------|-------|---------------|-------------|
| `(region, status)` | `profiles` | Filtre primaire matching | R40.2 |
| `(type, status)` | `profiles` | Liste prestataires actifs | R3 |
| `GIN(search_vector_fr)`, `GIN(search_vector_en)` | `profiles`, `services` | Full-text bilingue | R20 |
| `(profileId, isActive)` | `services` | Liste services actifs | R5 |
| `(targetId, status, createdAt)` | `match_requests` | Inbox utilisateur | R6.1 |
| `(expiresAt, status)` | `match_requests` | Cron purge expirées | R24.5 |
| `(conversationId, createdAt)` | `messages` | Pagination cursor | R8.2 |
| `(predicate, sourceEntityId)` | `relations` | Traversal sortant | R19.2 |
| `(predicate, targetEntityId)` | `relations` | Traversal entrant | R19.2 |
| `HNSW(embedding vector_cosine_ops)` | `graph_embeddings` | Similarité vectorielle | R20.1, R41.3 |
| `(provider, providerTransId)` | `payments` | Idempotence webhook | R29.5 |
| `(createdAt, node)` | `llm_calls` | Aggregation tokens / jour | R42.2 |
| `(queryHash)` | `match_sessions` | Cache lookup et qualité | R41.4, R42.4 |

Toutes les migrations utilisent `CREATE INDEX CONCURRENTLY` pour ne pas bloquer la production (R41 implicite).

---

## Conception du système Graph RAG

Cette section décrit le cœur AI engineering de la plateforme : le modèle d'entités, l'extraction structurée depuis les conversations, l'algorithme de Graph_Traversal récursif, la fusion RRF avec la recherche vectorielle, et le module de diversité. La motivation des choix de conception (et leurs trade-offs) est explicitée.

### Modèle d'entités (Zod)

Chaque type d'entité a un schéma de validation distinct. Cela permet à l'`ExtractionNode` de produire un JSON typé que `parseEntity` (R23) peut valider strictement.

```ts
// src/operations/graph/entity-schemas.ts
import { z } from "zod";

const Base = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid().nullable(),
  confidence: z.number().min(0).max(1),
  status: z.enum(["active", "pending_review", "archived"]),
  source: z.enum(["conversation", "dashboard"]),
  createdAt: z.string().datetime(),
});

export const UserEntity = Base.extend({
  type: z.literal("user"),
  value: z.string().cuid(),                      // = userId réel
});

export const ServiceEntity = Base.extend({
  type: z.literal("service"),
  value: z.string().min(1).max(160),             // titre normalisé du service
  metadata: z.object({
    serviceId: z.string().cuid(),
    priceFcfa: z.number().int().nonnegative().optional(),
    availability: z.enum(["available", "busy", "unavailable"]).optional(),
  }),
});

export const SkillEntity = Base.extend({
  type: z.literal("skill"),
  value: z.string().min(1).max(80),              // "plomberie", "react", "comptabilité"
});

export const LocationEntity = Base.extend({
  type: z.literal("location"),
  value: z.string().min(1).max(120),
  metadata: z.object({
    region: z.enum(["CM","CI","SN","BF","GA","TG","BJ","NE","TD","CG"]),
    city: z.string().optional(),
    geoPoint: z.object({ lat: z.number(), lng: z.number() }).optional(),
  }),
});

export const IndustryEntity = Base.extend({
  type: z.literal("industry"),
  value: z.string().min(1).max(80),              // "btp", "agroalimentaire", "tech"
});

export const NeedEntity = Base.extend({
  type: z.literal("need"),
  value: z.string().min(1).max(160),             // "trouver-comptable", "trouver-cofondateur-tech"
  metadata: z.object({
    budgetFcfaMin: z.number().int().optional(),
    budgetFcfaMax: z.number().int().optional(),
    urgency: z.enum(["low", "medium", "high"]).optional(),
  }).optional(),
});

export const Entity = z.discriminatedUnion("type", [
  UserEntity, ServiceEntity, SkillEntity, LocationEntity, IndustryEntity, NeedEntity,
]);
export type Entity = z.infer<typeof Entity>;
```

### Modèle de relations

Chaque prédicat a une sémantique précise et des contraintes de typage source/cible vérifiées en application :

| Prédicat | Source | Cible | Sémantique | Source de création |
|----------|--------|-------|------------|---------------------|
| `provides` | `user` | `service` | Le User propose ce Service | dashboard (création service) |
| `requires` | `service` | `skill` | Le Service nécessite cette Skill | extraction conversation |
| `located_in` | `user` ou `service` | `location` | Géolocalisation | dashboard ou extraction |
| `looks_for` | `user` | `need` | Le User cherche ce Need | extraction conversation |
| `matches` | `user` | `user` | Match_Request envoyée (sans verdict) | dashboard (action matching) |
| `connected_to` | `user` | `user` | Match accepté → conversation ouverte | dashboard (acceptation) |
| `rated` | `user` | `user` | Notation post-mission (`strength` dérivée du score 1→0.0 ... 5→1.0) | dashboard (R22.3) |

`strength` est un float [0,1] qui décroît automatiquement en cas de relation négative (`rated` avec score 1) tout en restant non-nul afin d'éviter les exclusions binaires (R19.5).

### Algorithme d'extraction (`ExtractionNode`)

L'extraction est faite par un appel LLM **structured output** (LangChain `withStructuredOutput`) avec le schéma `ExtractionPayload` :

```ts
// src/operations/ai/extraction-schemas.ts
export const ExtractionPayload = z.object({
  entities: z.array(z.object({
    type: z.enum(["service","skill","location","industry","need"]),  // jamais "user" en extraction
    value: z.string().min(1).max(160),
    confidence: z.number().min(0).max(1),
    metadata: z.record(z.unknown()).optional(),
  })),
  relations: z.array(z.object({
    sourceRef: z.object({ type: z.literal("user"), userId: z.string() })
              .or(z.object({ type: z.string(), value: z.string() })),
    targetRef: z.object({ type: z.string(), value: z.string() }),
    predicate: z.enum(["provides","requires","located_in","looks_for"]),
    strength: z.number().min(0).max(1),
  })),
});
```

#### Prompt stratégique (résumé, version FR)

```
Tu es un extracteur d'entités pour un knowledge graph relationnel B2B.

Contexte:
  - Tour conversationnel en français/anglais d'un utilisateur de l'app
  - userId = {{userId}}, region = {{region}}, type = {{profileType}}

Mission:
  Identifier dans le tour:
    - Services évoqués (proposés par l'utilisateur ou cherchés)
    - Skills (compétences techniques ou métier)
    - Locations (ville/quartier/région)
    - Industries (secteur d'activité)
    - Needs (besoins formulés explicitement)

  Pour CHAQUE entité, attribuer une confidence ∈ [0,1]:
    1.0 = mention explicite et univoque
    0.7 = mention claire mais nécessite contexte
    0.4 = inférence depuis contexte (à valider)
    < 0.4 = ne pas inclure

Règles strictes:
  - Ne jamais inventer d'entités non présentes dans le texte
  - Ne pas extraire de PII (téléphone, email, nom de famille, adresse précise)
  - Normaliser les valeurs (lowercase, sans diacritiques sauf locations)
  - Pour Skills, préférer le terme métier standard ("plomberie" plutôt que "tuyaux")

Format de sortie strictement conforme au schema fourni.
```

#### Pseudo-code d'extraction et persistance

```
extract(turn, context):
    # 1. Appel LLM avec structured output
    payload = LLM.invokeStructured(extractPrompt(turn, context), ExtractionPayload)

    # 2. Validation Zod (R23.4 retry max 3 si fail)
    if !ExtractionPayload.safeParse(payload):
        retries++
        if retries > 3: log_error_and_skip()
        else: retry with hardened prompt

    # 3. Pour chaque entité extraite:
    for raw in payload.entities:
        if raw.confidence < 0.5: status = "pending_review"
        else: status = "active"

        normalized = normalize(raw.value)             # lowercase + diacritics removal

        # Dédup par (userId, type, normalized)
        existing = entities.findUnique(userId, raw.type, normalized)

        if existing:
            # Renforcement par décroissance complémentaire (monotone bornée à 1.0)
            new_conf = 1 - (1 - existing.confidence) * (1 - raw.confidence)
            entities.update({ confidence: new_conf, updatedAt: now() })
            entity_id = existing.id
        else:
            entity_id = entities.create({
                userId: ctx.userId, type: raw.type, value: raw.value,
                normalized, confidence: raw.confidence, status, source: "conversation",
                metadata: raw.metadata,
            }).id

            # Embedding async (R18.6)
            ctx.scheduler.runAfter(0, "graph.regenerate-embedding", { entityId: entity_id })

    # 4. Pour chaque relation:
    for rel in payload.relations:
        source_id = resolveEntity(rel.sourceRef, ctx.userId)
        target_id = resolveEntity(rel.targetRef, ctx.userId)
        if source_id and target_id:
            relations.upsert({
                where: { sourceEntityId: source_id, targetEntityId: target_id, predicate: rel.predicate },
                create: { strength: rel.strength, source: "conversation" },
                update: { strength: max(prev.strength, rel.strength) },   # renforcement
            })

    # 5. Le ResponseNode reçoit l'extraction comme contexte (peut référencer)
    return payload
```

**Trade-offs**
- *Confidence renforcée par décroissance complémentaire* (formule `1 - (1-a)(1-b)`) : rend le score monotone et borné, évite la saturation rapide à 1.0 vue avec une simple moyenne ou max.
- *Embedding asynchrone* : on accepte une fenêtre de 1-2 minutes où l'entité n'est pas encore dans `graph_embeddings`. Trade-off acceptable car le matching est principalement fait sur le Graph_Traversal pour les nouvelles entités, l'embedding renforce a posteriori.
- *Pas d'extraction de `User` ni de `Match`* : ces entités/relations sont créées exclusivement par les mutations dashboard pour éviter les hallucinations.

### Algorithme de Graph_Traversal

Le traversal est implémenté en **CTE récursive PostgreSQL** plutôt que dans la couche application : il bénéficie ainsi du planner Postgres, des indexes B-tree sur `(predicate, source_entity_id)`, et évite N+1 queries.

#### Pseudo-code (vue logique)

```
traverse(seedEntityIds, region, maxDepth=3, maxPaths=10000):
    """
    Pour chaque chemin entité_seed → user_candidat de longueur 1..maxDepth :
      - Score chemin = produit des strength * decay_factor^longueur
      - Pénalité si rated avec score faible
      - Agrégation par user_candidat = somme des chemins distincts
    """
    return recursive_cte(seedEntityIds, region, maxDepth, maxPaths)
```

#### SQL (CTE récursive)

```sql
-- src/operations/graph/traverse.sql.ts (compilé via prisma $queryRaw)
WITH RECURSIVE
  paths AS (
    -- Base : chemins de longueur 1 depuis chaque seed
    SELECT
      r.source_entity_id    AS origin_id,
      r.target_entity_id    AS current_id,
      ARRAY[r.id]           AS path_relations,
      r.strength            AS path_score,
      1                     AS depth,
      ARRAY[r.predicate]::text[] AS path_predicates
    FROM relations r
    WHERE r.source_entity_id = ANY ($1::text[])      -- seedEntityIds
      AND r.predicate IN ('provides','requires','located_in','looks_for','matches','connected_to','rated')

    UNION ALL

    -- Récursion : étendre tant que depth < maxDepth
    SELECT
      p.origin_id,
      r.target_entity_id,
      p.path_relations || r.id,
      p.path_score *
        r.strength *
        CASE
          WHEN r.predicate = 'rated' AND r.strength < 0.3 THEN 0.5    -- pénalité légère
          ELSE 1.0
        END *
        0.85                                       -- decay_factor par hop
        AS path_score,
      p.depth + 1,
      p.path_predicates || r.predicate
    FROM paths p
    JOIN relations r ON r.source_entity_id = p.current_id
    WHERE p.depth < $2                             -- maxDepth
      AND r.id <> ALL (p.path_relations)            -- évite cycles
  ),

  -- Filtre : chemins qui aboutissent à des entités de type user dans la region voulue
  candidate_paths AS (
    SELECT
      e.user_id   AS candidate_user_id,
      p.path_score,
      p.depth,
      p.path_predicates
    FROM paths p
    JOIN entities e ON e.id = p.current_id
    JOIN profiles pr ON pr.user_id = e.user_id
    WHERE e.type = 'user'
      AND pr.status = 'active'
      AND ($3::text IS NULL OR pr.region = $3)     -- region nullable (R50.2 expand)
      AND e.user_id <> $4                           -- exclure soi-même
    LIMIT $5                                        -- maxPaths
  ),

  -- Agrégation par candidat : somme des chemins distincts (path-disjoint via DISTINCT)
  scored AS (
    SELECT
      candidate_user_id,
      SUM(path_score)               AS total_score,
      MIN(depth)                    AS shortest_depth,
      COUNT(*)                      AS path_count,
      array_agg(DISTINCT path_predicates) AS predicate_paths
    FROM candidate_paths
    GROUP BY candidate_user_id
  )

SELECT
  s.candidate_user_id,
  s.total_score,
  s.shortest_depth,
  s.path_count,
  s.predicate_paths,
  ROW_NUMBER() OVER (ORDER BY s.total_score DESC) AS graph_rank
FROM scored s
ORDER BY s.total_score DESC
LIMIT 50;                                          -- top-50 candidats (R19.4)
```

#### Trade-offs Graph_Traversal

| Choix | Alternative envisagée | Justification |
|-------|----------------------|---------------|
| CTE récursive Postgres | base graphe (Neo4j, ArangoDB) | Évite un service supplémentaire ; profondeur limitée à 3 ; pgvector déjà nécessaire ; CTE performante avec index B-tree |
| `decay_factor = 0.85^depth` | `1 / depth` | Atténuation lisse, paramétrable via `business_config.GRAPH_DECAY_FACTOR` |
| Pénalité `rated < 0.3 → ×0.5` | exclusion dure | Conforme à R19.5 (pondération continue, pas exclusion) |
| `maxPaths = 10000` | sans plafond | Garantit la borne de latence 800 ms p95 (R41.2) sur graphes denses |
| `LIMIT 50` candidats | LIMIT plus large | Aligne avec EmbeddingQuery (50) pour avoir des classements comparables au RRF |

### Algorithme EmbeddingQuery

Embedding de la requête généré via `ai.search-vector.action.ts` (modèle `text-embedding-3-small` par défaut, 1536 dim, configurable). Recherche pgvector :

```sql
SELECT
  ge.metadata ->> 'userId'                AS candidate_user_id,
  1 - (ge.embedding <=> $1::vector)       AS similarity,        -- cosine ∈ [0,1]
  ROW_NUMBER() OVER (ORDER BY ge.embedding <=> $1::vector ASC) AS vector_rank
FROM graph_embeddings ge
JOIN entities e ON e.embedding_id = ge.id
JOIN profiles pr ON pr.user_id = e.user_id
WHERE e.type IN ('user', 'service')
  AND e.status = 'active'
  AND pr.status = 'active'
  AND ($2::text IS NULL OR pr.region = $2)
  AND e.user_id <> $3
ORDER BY ge.embedding <=> $1::vector
LIMIT 50;
```

L'opérateur `<=>` (cosine distance) tire profit de l'index HNSW (`vector_cosine_ops`).

### Algorithme HybridScoring (RRF)

```
rrf(graphResults, vectorResults, k=60, weights={graph:0.6, vector:0.4}):
    """
    Reciprocal Rank Fusion :
      score(c) = w_graph * 1/(k + rank_graph(c)) + w_vector * 1/(k + rank_vector(c))
    Robuste à l'hétérogénéité des distributions de scores.
    """
    candidates = union(graphResults.users, vectorResults.users)
    scores = []
    for c in candidates:
        rg = graphResults.rankOf(c) ?? infinity
        rv = vectorResults.rankOf(c) ?? infinity
        s = weights.graph / (k + rg) + weights.vector / (k + rv)
        scores.push({ user_id: c, rrf: s, rank_graph: rg, rank_vector: rv })

    # Bonus Badge_Verifie (R21.4)
    for s in scores:
        if profiles[s.user_id].is_verified:
            s.rrf *= 1.10
            s.badge_bonus = 1.10

    # Normalisation [0,1]
    maxRrf = max(scores.rrf)
    for s in scores:
        s.normalized = s.rrf / maxRrf

    return scores.sortByDesc("rrf")
```

#### SQL équivalent (option full-DB)

Pour les très gros volumes, le RRF peut être exécuté en SQL pur via UNION + sous-requêtes :

```sql
WITH graph_ranked AS (...),                     -- traverse() ci-dessus
     vector_ranked AS (...),                    -- embedding query ci-dessus
     fused AS (
       SELECT
         coalesce(g.candidate_user_id, v.candidate_user_id) AS user_id,
         g.graph_rank,
         v.vector_rank,
         (0.6 / (60 + coalesce(g.graph_rank, 1000))) +
         (0.4 / (60 + coalesce(v.vector_rank, 1000))) AS rrf_score
       FROM graph_ranked g
       FULL OUTER JOIN vector_ranked v ON v.candidate_user_id = g.candidate_user_id
     )
SELECT
  f.user_id,
  f.graph_rank,
  f.vector_rank,
  f.rrf_score *
    CASE WHEN pr.is_verified THEN 1.10 ELSE 1.0 END AS final_score,
  pr.is_verified                                       AS badge_bonus_applied
FROM fused f
JOIN profiles pr ON pr.user_id = f.user_id
ORDER BY final_score DESC
LIMIT 25;
```

`k = 60` est la valeur recommandée par la littérature (Cormack et al. 2009). On l'expose néanmoins via `business_config.RRF_K` pour expérimentation.

### Algorithme Diversity_Mix

Le module Diversity garantit qu'on ne renvoie pas seulement les top-N par score (R21). Il répartit les 5 slots finaux selon une heuristique paramétrable :

```
diversify(scoredList, slots=5):
    """
    Stratégie:
      slot 1 (boost)      : Prestataire avec Boost actif satisfaisant la requête (R21.3)
      slots 2-3 (high)    : top 2 du quartile supérieur du rrf_score
      slot 4 (mid)        : top 1 du quartile médian
      slot 5 (wildcard)   : tirage pondéré dans la queue (rrf_score > seuil minimum)

      Si pas de boost actif: slot 1 → high (= top 3 high score, R21.1)
    """
    quartiles = computeQuartiles(scoredList.map(s => s.normalized))
    high  = scoredList.filter(s => s.normalized >= quartiles.q3)
    mid   = scoredList.filter(s => s.normalized >= quartiles.q2 and s.normalized < quartiles.q3)
    tail  = scoredList.filter(s => s.normalized >= quartiles.q1 and s.normalized < quartiles.q2)

    selected = []

    boostCandidate = scoredList.find(s => boosts.activeFor(s.userId) and s.normalized >= quartiles.q1)
    if boostCandidate:
        selected.push({ ...boostCandidate, bucket: "boost" })

    while selected.length < 3 and high.length > 0:
        selected.push({ ...high.shift(), bucket: "high" })

    while selected.length < 4 and mid.length > 0:
        selected.push({ ...mid.shift(), bucket: "mid" })

    if selected.length < 5 and tail.length > 0:
        # Tirage pondéré par score (favorise les meilleurs sans déterminisme strict)
        wildcard = weightedSample(tail, weights=tail.map(s => s.normalized))
        selected.push({ ...wildcard, bucket: "wildcard" })

    return dedupeByUserId(selected)
```

#### Filtres d'exclusion appliqués avant Diversity (R21.2)

```
excludeFilters(scoredList, requesterId):
    return scoredList.filter(s => {
        if s.userId == requesterId: false
        if profiles[s.userId].status != "active": false
        if hasRecentMatch(requesterId, s.userId, days=30): false
        if hasBlock(requesterId, s.userId): false
        return true
    })
```

#### Trade-offs Diversity

- *Quartile fixé sur la liste reçue* (et non sur un benchmark global) : permet à des requêtes peu fréquentes d'avoir quand même des résultats du « haut » de leur propre distribution.
- *Wildcard pondéré* : maintient une légère exploration sans dégrader la pertinence ; alternative écartée : tirage uniforme (trop bruité).
- *Slot Boost réservé* : conforme à R21.3, mais conditionné par un seuil minimal (`>= q1`) pour ne pas pousser un Boost manifestement non pertinent.

### Mise à jour incrémentale (R22)

```
on service.create | service.update | service.deactivate:
    ctx.scheduler.runAfter(0, "graph.upsert-from-service", { serviceId, action })

on profile.update (champs bio | skills | location):
    ctx.scheduler.runAfter(0, "graph.regenerate-embedding", {
      entityId: profile.userEntity.id,
      reason: "profile_changed",
    })

on rating.submit:
    ctx.scheduler.runAfter(0, "graph.upsert-rated-relation", {
      raterId, ratedId, score, conversationId,
    })
    # mapping score → strength (R22.3)
    # 1 → 0.0, 2 → 0.25, 3 → 0.5, 4 → 0.75, 5 → 1.0
```

Retry exponentiel via `AuraOutboxEvent` (1s, 2s, 4s, 8s, 16s, 32s, échec définitif après 6 tentatives), avec marquage `entities.embeddingStale = true` et notification Admin (R22.5).

### Round-trip serialization (R23)

```ts
// src/operations/graph/serialize.ts
export function serializeEntity(e: EntityRow): string {
  // JSON canonique : clés triées, dates en ISO, pas de undefined
  const canonical = {
    id: e.id,
    userId: e.userId,
    type: e.type,
    value: e.value,
    confidence: Number(e.confidence.toFixed(4)),
    status: e.status,
    source: e.source,
    metadata: sortObjectKeys(e.metadata ?? {}),
    createdAt: e.createdAt.toISOString(),
  };
  return JSON.stringify(canonical);
}

export function parseEntity(json: string): EntityRow {
  const parsed = JSON.parse(json);
  return Entity.parse(parsed) as EntityRow;          // lance ZodError si non conforme
}
```

Property garantie : pour tout `e: EntityRow` valide, `parseEntity(serializeEntity(e))` retourne un objet **structurellement équivalent** (égalité profonde sur les champs sérialisés). Idem pour `Relation`. Cf. section Correctness Properties pour la formalisation.

L'export complet d'un sous-graphe utilisateur (R23.5) sérialise un objet `{ entities: [...], relations: [...], embeddings: [...] }` où les embeddings sont encodés en base64 du Float32Array.

---

## Conception des Instances LangGraph

### Graphe_Agent_User (1 instance par utilisateur)

#### Schéma d'état (channels LangGraph)

```ts
// src/operations/ai/agent-user-state.ts
export const AgentUserState = z.object({
  // Identité
  userId: z.string().cuid(),
  language: z.enum(["fr", "en"]).default("fr"),
  region: z.enum(["CM","CI","SN","BF","GA","TG","BJ","NE","TD","CG"]),

  // Hydratation
  profile: z.object({ ... }).nullable(),
  services: z.array(z.object({ ... })).default([]),
  hydratedAt: z.string().datetime().nullable(),

  // Tour courant
  inbound: z.object({
    text: z.string(),
    receivedAt: z.string().datetime(),
    correlationId: z.string().uuid(),
    providerMessageId: z.string(),
  }),

  // Historique tronqué (dernier N tours pour éviter explosion contexte)
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string(),
    at: z.string().datetime(),
  })).default([]),

  // Outputs intermédiaires
  intent: z.enum(["chat","recherche-prestataire","recherche-connexion","gestion-compte","aide"]).nullable(),
  intentConfidence: z.number().min(0).max(1).nullable(),
  extractedConstraints: MatchingConstraintsSchema.nullable(),
  matchingResult: MatchingResultSchema.nullable(),
  draftReply: z.string().nullable(),

  // Final
  reply: z.string().nullable(),
  outboundIdempotencyKey: z.string().uuid().nullable(),
});
```

#### Contrats de nodes

| Node | Entrée | Sortie | Règles |
|------|--------|--------|--------|
| `HydrationNode` | `{userId, region}` | `{profile, services, hydratedAt, language}` | Lit depuis DB. Si `users.whatsappLinked = false` court-circuite vers `LinkCodeFlow`. R13.1-3 |
| `ConversationNode` | `state` | `state.draftReply` | Appel LLM avec system persona FR/EN, tools = liste opérations exposées (`api.services.list-mine.asTool()`, etc.) avec `requiresApproval` pour mutations sensibles |
| `ExtractionNode` | `state.inbound + state.profile` | `state` (effet de bord : entities/relations persistées) | LLM structured output ; pas de modification du `draftReply` |
| `MatchingIntentNode` | `state.history + state.inbound` | `state.intent + state.intentConfidence + state.extractedConstraints` | Classifieur LLM ; si confidence < 0.7 demande clarification (R14.4) |
| `OrchestratorCallNode` | `state.extractedConstraints` | `state.matchingResult` | Tool call vers `Orchestrateur_Matching` ; timeout 5s ; fallback message R15.5 si vide |
| `ResponseNode` | `state.draftReply ou matchingResult` | `state.reply` | Persona guardrail (régex + LLM judge), reformulation jusqu'à 2 essais (R11.4) |

#### Transitions

```
HydrationNode
    │
    ▼
ConversationNode
    │
    ▼
ExtractionNode  ──┐
                  │ side effect: persist entities/relations
                  ▼
MatchingIntentNode
    │
    ├── intent = "recherche-prestataire" | "recherche-connexion"
    │     and confidence >= 0.7 ────────────────────┐
    │                                               ▼
    │                                       OrchestratorCallNode
    │                                               │
    │                                               ▼
    └── else ──────────────────────────────▶ ResponseNode
                                                    │
                                                    ▼
                                                  END
```

#### Persistence du state

```ts
// src/aura/server/ai/checkpointer.ts
export class AuraPostgresCheckpointer implements BaseCheckpointSaver {
  async put(threadId: string, state: AgentUserState) {
    await prisma.agent_states.upsert({
      where: { userId: threadId },
      create: { userId: threadId, state, currentNode: state.lastNode, ... },
      update: { state, currentNode: state.lastNode, version: { increment: 1 }, ... },
    });
    await prisma.agent_state_history.create({
      data: {
        userId: threadId,
        fromNode: previous, toNode: state.lastNode,
        delta: computeDelta(previous, state),
        correlationId: state.inbound.correlationId,
      },
    });
  }
  async get(threadId: string) { return prisma.agent_states.findUnique({ where: { userId: threadId } }); }
}
```

Conformément à R13.4, le state est persisté **après chaque transition**. La table `agent_state_history` permet le replay déterministe et l'analyse post-mortem.

#### Cache d'hydration

```
on profile.update | services.upsert | services.delete:
    cacheInvalidate(`agent:hydration:${userId}`)

HydrationNode:
    cached = redis.get(`agent:hydration:${userId}`)
    if cached and cached.fetchedAt > now - 60s:
        return cached
    fresh = db.profiles.findWithServices(userId)
    redis.set(`agent:hydration:${userId}`, fresh, ttl=60s)
    return fresh
```

### Orchestrateur_Matching (graphe séparé)

#### State

```ts
export const OrchestratorState = z.object({
  request: MatchingRequestSchema,                       // { requesterId, region, intent, constraints, correlationId }
  cacheHit: z.boolean(),
  graphResults: z.array(GraphHitSchema).default([]),
  vectorResults: z.array(VectorHitSchema).default([]),
  graphLatencyMs: z.number(),
  vectorLatencyMs: z.number(),
  fused: z.array(FusedHitSchema).default([]),
  filtered: z.array(FusedHitSchema).default([]),
  diversified: z.array(DiversifiedHitSchema).default([]),
  result: MatchingResultSchema.nullable(),
});
```

#### Parallélisation Graph + Vector

```
ReceiveRequest ─▶ CacheLookup ─┬── HIT ──────────────────▶ Return
                               │
                               └── MISS ──┐
                                          │
                          ┌───────────────┴───────────────┐
                          │ Promise.all([                  │
                          │   GraphTraversal(req)          │
                          │   EmbeddingQuery(req)          │
                          │ ])                             │
                          │                                │
                          │ Timeouts:                      │
                          │   GraphTraversal  : 800 ms     │
                          │   EmbeddingQuery  : 300 ms     │
                          │                                │
                          │ Si timeout l'un des deux:      │
                          │   continue avec le seul        │
                          │   résultat disponible          │
                          │   (R20.4 RRF tolère absence)   │
                          └────────────────┬───────────────┘
                                           ▼
                                    HybridScoring
                                           │
                                           ▼
                                       Filter
                                           │
                                           ▼
                                     Diversity
                                           │
                                           ▼
                                     CacheStore
                                           │
                                           ▼
                                       Return
```

#### Stratégies de fallback

| Cas | Comportement |
|-----|--------------|
| `EmbeddingQuery` timeout 300 ms dépassé | Continue sans vector, RRF utilise infinity comme rank vector |
| `GraphTraversal` timeout 800 ms dépassé | Idem côté graph |
| Les deux timeouts dépassés | Retourne `{ profiles: [] }` avec `meta.degraded = true`, l'agent affiche message "service temporairement saturé" |
| Erreur DB | Erreur remontée, log structuré, retry exponentiel côté agent (max 2) |
| Provider LLM down (embedding) | Bascule sur provider de secours configuré (R43.4) |

### Persona_Pro_Vouvoyante

#### System prompt template (FR)

```
Vous êtes l'assistante IA professionnelle de la plateforme {{plateforme_nom}}, un service de mise en relation au Cameroun et en Afrique francophone.

PERSONA - règles strictes:
  - Vouvoiement systématique. Jamais de "tu", "toi", "ta", "tes".
  - Ton neutre et professionnel. Pas de familiarité, pas d'humour personnel.
  - Pas d'emojis sauf 1 maximum en fin de message si contexte célébration (✓, ☆).
  - Pas d'argot, pas d'expressions familières (ex: "ouais", "yo", "trop bien").
  - Phrases courtes et claires. Pas de digression.
  - Vous ne donnez jamais d'avis politique, médical, juridique ou financier personnel.

PORTÉE - vous pouvez aider sur:
  - Compléter le profil utilisateur, ajouter/modifier des services
  - Rechercher un prestataire ou une connexion
  - Gérer un matching reçu / envoyé
  - Naviguer dans la plateforme
  - Comprendre une notification

REFUS - vous redirigez poliment vers la plateforme dans ces cas:
  - Sujets politiques, religieux, médicaux, juridiques individuels
  - Demandes hors périmètre du service de matching
  - Demandes de communiquer numéros, emails ou adresses précises de tiers (toujours interdit)

CONTEXTE UTILISATEUR (chargé par HydrationNode):
  Nom: {{profile.name}}
  Type: {{profile.type}}
  Région: {{profile.region}}
  Services: {{profile.services_summary}}
  Langue préférée: fr

INSTRUCTIONS:
  Répondez à l'utilisateur en français formel, en moins de 280 caractères sauf si la demande exige un texte plus long. Si l'utilisateur évoque clairement une recherche de prestataire ou de connexion, le système basculera automatiquement vers le module de matching.
```

#### System prompt template (EN)

Identique en structure mais avec :
- Registre formel ("please", "kindly", éviter contractions)
- Expressions équivalentes ("Dear user", "I would suggest", "May I assist")
- Pas de slang ("yeah", "cool", "btw")

#### Guardrail au niveau ResponseNode

```ts
// src/operations/ai/persona-guardrail.ts
const FORBIDDEN_PATTERNS_FR = [
  /\b(tu|toi|ta|tes|ton|t['']es|t['']as)\b/i,    // tutoiement
  /\b(yo|salut|coucou|cc|wesh|trop\s+bien)\b/i,  // argot/familier
  /[\u{1F600}-\u{1F64F}]{2,}/u,                  // 2+ emojis consécutifs
  /\b(politique|médecin|avocat)\s+(personnel|particulier)/i,
];

const FORBIDDEN_PATTERNS_EN = [
  /\b(yo|hey|sup|gonna|wanna|lol|btw)\b/i,
  /[\u{1F600}-\u{1F64F}]{2,}/u,
];

const PII_PATTERNS = [
  /\+?\d{10,}/,                                   // numéros téléphone
  /[\w.+-]+@[\w-]+\.[\w.-]+/,                     // emails
  /\b(rue|avenue|boulevard|quartier)\s+\w+/i,     // adresses précises
];

export async function applyGuardrail(reply: string, lang: Language): Promise<GuardrailResult> {
  const patterns = lang === "fr" ? FORBIDDEN_PATTERNS_FR : FORBIDDEN_PATTERNS_EN;
  
  // Check 1 : regex
  for (const p of patterns) {
    if (p.test(reply)) return { ok: false, reason: "regex", pattern: p.source };
  }
  for (const p of PII_PATTERNS) {
    if (p.test(reply)) return { ok: false, reason: "pii_leak", pattern: p.source };
  }
  
  // Check 2 : LLM-as-judge (modèle léger)
  const judgement = await llm.invoke([
    { role: "system", content: PERSONA_JUDGE_PROMPT },
    { role: "user", content: `Réponse à juger: ${reply}` },
  ]);
  
  if (judgement.verdict === "non_conforme") {
    return { ok: false, reason: "judge", detail: judgement.reason };
  }
  
  return { ok: true };
}
```

Pseudo-code de boucle de régénération (R11.4) :

```
generateResponse(state):
    for attempt in 1..3:
        reply = LLM.invoke(personaPrompt(state))
        guardrail = applyGuardrail(reply, state.language)
        if guardrail.ok:
            return reply
        else:
            log_violation(attempt, guardrail.reason)
            # tour 2 et 3 : injecter le motif dans le prompt pour autocorrection
            personaPrompt = personaPrompt.with_correction_hint(guardrail.reason)
    
    # Echec définitif → réponse de secours conforme prédéfinie
    return getFallbackReply(state.language, state.intent)
```

### Multilingue FR/EN (R12)

```ts
// src/aura/server/ai/language-detection.ts
import { franc } from 'franc-min';

export function detectLanguage(text: string, history: HistoryEntry[]): {
  language: Language;
  confidence: number;
} {
  const lang = franc(text, { whitelist: ['fra', 'eng'] });
  
  // franc retourne 'und' si confiance trop basse
  if (lang === 'und') {
    // Fallback sur dernier tour utilisateur
    const last = history.findLast(h => h.role === 'user');
    if (last) return detectLanguage(last.text, []);
    return { language: 'fr', confidence: 0.0 };  // défaut R12.2
  }
  
  const language = lang === 'fra' ? 'fr' : 'en';
  
  // Confiance heuristique : ratio mots reconnus
  const confidence = computeConfidence(text, language);
  
  return { language, confidence };
}
```

Si `confidence < 0.8` (R12.1), on utilise la `agent_states.language` persistée (R12.4). Si la confidence est élevée et la langue diffère du tour précédent, on bascule (R12.3).

### Tool calling (operations Aura comme tools LangChain)

Conformément à la décision Aura 24, chaque opération expose une méthode `.asTool({ description })` qui produit un `StructuredTool` LangChain :

```ts
// Dans Graphe_Agent_User
const tools = [
  api.services.list-mine.asTool({
    description: "Liste vos services actifs (carte de visite professionnelle)",
  }),
  api.matching.create-request.asTool({
    description: "Envoie une demande de mise en relation à un profil identifié dans la dernière liste de résultats",
  }).requiresApproval(),                    // human-in-the-loop
  api.subscriptions.status.asTool({
    description: "Affiche l'état de votre abonnement Pro",
  }),
];
```

Pour les tools `.requiresApproval()` (création Match_Request), le flow LangGraph s'arrête sur un `interrupt` ; le state est sauvegardé ; le ConversationNode renvoie un message du type *« Souhaitez-vous que je transmette cette demande au profil n° 2 ? Répondez oui/non. »* ; le tour suivant reprend après confirmation.

---

## Intégration WhatsApp

### Webhook entrant

```
POST /webhooks/whatsapp
  Headers:
    X-Evolution-Signature: hex(HMAC_SHA256(secret, body))    [Baileys/Evolution]
    X-Hub-Signature-256: sha256=<hex>                        [WA Business API]
  Body:
    {
      messages: [
        {
          key: { remoteJid, fromMe, id },
          messageTimestamp,
          pushName,
          message: { conversation: "texte", ... }
        }
      ],
      sessionId, ...
    }
```

#### Implémentation Hono

```ts
// src/operations/webhooks/whatsapp.http.ts
import { defineHttpAction } from "@/aura/server/http-action";
import { auraRateLimit } from "@aura/rate-limit";

export default defineHttpAction("/webhooks/whatsapp", "POST")
  .public()
  .csrf(false)
  .middleware(auraRateLimit({ key: (req) => req.headers.get("x-forwarded-for") ?? "ip", limit: 100, windowSeconds: 60 }))
  .handler(async (ctx, request) => {
    const rawBody = await request.text();

    // 1. Validation HMAC
    const gateway = WhatsAppGatewayFactory.forPhase(ctx.config.businessPhase);
    if (!gateway.verifyWebhookSignature({ headers: request.headers, rawBody })) {
      return new Response("invalid signature", { status: 401 });
    }

    // 2. Parse strict (R48)
    let parsed: WhatsAppInboundPayload;
    try {
      parsed = gateway.parseInbound(rawBody);
    } catch (err) {
      // Conserver raw pour debug 30 jours (R48.5)
      await ctx.db.whatsapp_inbox.create({
        data: { providerMessageId: extractId(rawBody) ?? cuid(), fromE164: "unknown",
                rawPayload: JSON.parse(rawBody) ?? {}, parsedOk: false, parseError: String(err) },
      });
      return new Response("bad request", { status: 400 });
    }

    // 3. Idempotence (R49.3)
    for (const msg of parsed.messages) {
      const existing = await ctx.db.whatsapp_inbox.findUnique({
        where: { providerMessageId: msg.providerMessageId },
      });
      if (existing) continue;                  // déjà traité

      await ctx.db.whatsapp_inbox.create({
        data: { providerMessageId: msg.providerMessageId, fromE164: msg.fromE164,
                rawPayload: msg.raw, parsedOk: true, parseError: null },
      });

      // 4. Enqueue worker
      await ctx.scheduler.runAfter(0, api.ai.process-incoming-message, {
        providerMessageId: msg.providerMessageId,
        correlationId: cuid(),                 // tracé jusqu'à llm_calls
      });
    }

    // 5. ACK 200 (sous 200 ms)
    return new Response("ok", { status: 200 });
  });
```

### Worker traitement message

```
process-incoming-message action:
    1. resolve user_id par phone E.164
       - si numéro non lié et message ressemble à code de liaison → flow liaison
       - si numéro non lié et autre message → réponse "envoyez votre code"
    2. récupérer agent_states[user_id] (ou créer si premier message)
    3. runGraphe_Agent_User(state, inboundMessage)
    4. on END → enqueue whatsapp.send avec state.reply
```

### Sortie messages

```ts
// src/aura/server/transport/whatsapp/baileys-gateway.ts
export class BaileysGateway implements WhatsAppGateway {
  async sendText({ to, body, idempotencyKey }) {
    const startedAt = Date.now();
    
    try {
      const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${SESSION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ number: to, text: body }),
      });
      
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) throw new RetryableError(`evolution ${res.status}`);
        throw new NonRetryableError(`evolution ${res.status}: ${await res.text()}`);
      }
      
      const data = await res.json();
      auraMetrics.observe("aura_whatsapp_messages_total", { direction: "out", status: "ok" }, 1);
      return { providerMessageId: data.key.id };
    } finally {
      auraMetrics.observe("aura_bot_latency_seconds", { phase: "send" }, (Date.now() - startedAt) / 1000);
    }
  }
  // ...
}
```

Pool de connexion : `undici.Pool` avec keep-alive, 10 connexions simultanées vers Evolution_API.

### Migration Baileys → WhatsApp Business API (R37)

#### Phases de bascule

| Phase | `BUSINESS_PHASE` | Gateway en lecture | Gateway en écriture |
|-------|------------------|--------------------|--------------------|
| MVP | `mvp` | Baileys | Baileys |
| Shadow | `mvp` | Baileys | Baileys + WAB en parallel-write (logs uniquement, jamais envoyé) |
| Cutover préparation | `mvp` | Baileys + WAB (comparison) | Baileys |
| Cutover | `freemium` | WAB | WAB |
| Rollback (contingence) | `mvp` | Baileys | Baileys |

Le flag est lu depuis `business_config.BUSINESS_PHASE` à chaque appel `WhatsAppGatewayFactory.forPhase()`. Cela permet une bascule sans redémarrage.

#### Différences à abstraire dans `WhatsAppGateway`

| Concern | Baileys (Evolution_API) | WhatsApp Business API |
|---------|-------------------------|-----------------------|
| Endpoint | `POST /message/sendText/{session}` | `POST /v22.0/{phone-number-id}/messages` |
| Auth | API key header | Bearer token (system user) |
| Webhook signature | HMAC custom Evolution | `X-Hub-Signature-256` Meta |
| Templates approuvés | Optionnel | Obligatoire pour messages "outbound non-réponse" |
| Rate-limit | session-based | tier-based (250/250000/...) |
| Statuts | `delivered`, `read` | idem + `failed.error` détaillé |

Le module `WhatsAppBusinessGateway` gère un store de templates approuvés (table `whatsapp_templates` non détaillée ici, structure libre) et applique le bon template pour chaque type de notification (R16).

---

## Intégration Paiements

### `PaymentProvider` (interface)

```ts
// src/aura/server/payments/types.ts
export const InitiatePaymentInput = z.object({
  userId: z.string().cuid(),
  type: z.enum(["badge", "boost", "pro", "commission", "escrow"]),
  amount: z.number().int().positive(),                  // FCFA
  currency: z.enum(["XAF", "XOF"]),
  region: z.enum(["CM","CI","SN","BF"]),
  paymentMethod: z.enum(["mobile_money", "card", "bank"]).optional(),
  phoneE164: z.string().optional(),                     // pour MoMo
  idempotencyKey: z.string().uuid(),                    // R49.1
  metadata: z.record(z.unknown()).optional(),
});

export const InitiatePaymentResult = z.object({
  providerTransId: z.string(),
  status: z.enum(["pending", "redirect_required", "succeeded", "failed"]),
  redirectUrl: z.string().url().optional(),
  ussd: z.string().optional(),                          // pour MoMo (#150*4*4#)
  expiresAt: z.string().datetime().optional(),
});
```

### Provider_Fapshi (MVP)

```ts
// src/aura/server/payments/fapshi-provider.ts
export class FapshiProvider implements PaymentProvider {
  name = "fapshi" as const;
  supportedRegions = ["CM"] as const;

  async initiatePayment(input: InitiatePaymentInput) {
    const res = await fetch(`${FAPSHI_BASE_URL}/initiate-pay`, {
      method: "POST",
      headers: {
        "apiuser": FAPSHI_API_USER,
        "apikey": FAPSHI_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        amount: input.amount,
        externalId: input.idempotencyKey,
        message: `Activation ${input.type}`,
        userId: input.userId,
        phone: input.phoneE164?.replace(/^237/, "") ?? undefined,
      }),
    });
    const data = await res.json();
    
    await prisma.payments.create({ data: {
      userId: input.userId, type: input.type, provider: "fapshi",
      providerTransId: data.transId, amount: input.amount, currency: "XAF",
      status: "pending", idempotencyKey: input.idempotencyKey,
      metadata: { fapshiResponse: data },
    }});
    
    return {
      providerTransId: data.transId,
      status: "pending",
      ussd: data.dateInitiated ? `Composez #150*1*1*${data.amount}*${data.transId}#` : undefined,
    };
  }

  verifyWebhookSignature({ headers, rawBody }) {
    const sig = headers.get("x-fapshi-signature");
    if (!sig) return false;
    const expected = createHmac("sha256", FAPSHI_WEBHOOK_SECRET).update(rawBody).digest("hex");
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  // ...
}
```

### Webhook Fapshi

```ts
// src/operations/webhooks/fapshi.http.ts
export default defineHttpAction("/webhooks/fapshi", "POST")
  .public()
  .csrf(false)
  .middleware(auraRateLimit({ key: (req) => req.headers.get("x-forwarded-for") ?? "ip", limit: 100, windowSeconds: 60 }))
  .handler(async (ctx, request) => {
    const rawBody = await request.text();
    const provider = paymentProviderFactory.byName("fapshi");

    if (!provider.verifyWebhookSignature({ headers: request.headers, rawBody })) {
      return new Response("invalid signature", { status: 401 });   // R29.3
    }
    
    const event = JSON.parse(rawBody) as FapshiWebhookEvent;
    
    // Idempotence (R29.5)
    const payment = await ctx.db.payments.findUnique({ where: { providerTransId: event.transId } });
    if (!payment) return new Response("unknown payment", { status: 404 });
    
    if (payment.status === "succeeded" && event.status === "SUCCESSFUL") {
      // Déjà traité, ne rien faire
      return new Response("ok (idempotent)", { status: 200 });
    }
    
    if (event.status === "SUCCESSFUL") {
      await ctx.runMutation(api.payments.activate-product, { paymentId: payment.id });
    } else if (event.status === "FAILED" || event.status === "EXPIRED") {
      await ctx.db.payments.update({
        where: { id: payment.id },
        data: { status: "failed", metadata: { ...payment.metadata, fapshiEvent: event } },
      });
    }
    
    return new Response("ok", { status: 200 });
  });
```

### Workflow d'activation produit

```
payment.activate-product (defineWorkflow):
    step "verify-status":
        payment = db.payments.findUnique(id)
        if payment.status !== "pending": return { skipped: true }
    
    step "mark-succeeded":
        db.payments.update({ status: "succeeded", succeededAt: now() })
    
    step "activate-by-type":
        switch (payment.type):
            case "badge":
                runWorkflow(api.workflows.verify-identity, { userId, paymentId })
            case "boost":
                db.boosts.create({ userId, paymentId, startsAt: now(), endsAt: now()+7d })
                ctx.scheduler.runAt(endsAt, api.boosts.expire, { boostId })
            case "pro":
                db.subscriptions.upsert({
                    where: { userId },
                    create: { userId, plan: "pro", endsAt: now()+30d, lastPaymentId: id },
                    update: { status: "active", endsAt: now()+30d, lastPaymentId: id },
                })
                ctx.scheduler.runAt(endsAt-7d, api.subscriptions.send-renewal-reminder, { userId })
                ctx.scheduler.runAt(endsAt, api.subscriptions.renew-charge, { userId })
    
    step "notify-whatsapp":
        ctx.scheduler.runAfter(0, api.notifications.whatsapp-send, {
            to: user.phone, template: `payment_succeeded_${payment.type}_${user.language}`,
        })
```

### Provider_Flutterwave (phase 3)

Implémentation similaire pointant vers `https://api.flutterwave.com/v3/payments`. La factory `paymentProviderFactory.forRegion(region)` route automatiquement.

```ts
const REGION_PROVIDERS: Record<Region, PaymentProvider> = {
  CM: fapshiProvider,
  CI: flutterwaveProvider,
  SN: flutterwaveProvider,
  BF: flutterwaveProvider,
};
```

### Escrow (phase 3)

Workflow durable `escrow.lifecycle` :

```
states: held → released | refunded | disputed → released_partial | refunded_partial

on mission.declare:
    step "initiate":
        provider.initiatePayment({ amount: missionAmount + commission })
    step "wait-funded":
        await event payment.succeeded(paymentId)
        db.mission_escrows.create({ ..., state: "held" })
    step "wait-confirmation":
        await event mission.confirmed (les deux parties valident la livraison)
        ou event dispute.opened ou timeout 30j
    step "settle":
        if confirmed:
            provider.payout(prestataireId, missionAmount)
            mission_escrows.state = "released"
        if disputed:
            mission_escrows.state = "disputed"
            await admin decision
            applique répartition selon decision
```

---

## Chat Anonyme et Double Opt-in

### Architecture Aura broadcast WebSocket

Le chat utilise exclusivement Aura broadcast (R26.1, **pas Socket.io**). Trois types de rooms :

```
conversation:{conversationId}    → diffusion des messages chat aux 2 participants
user:{userId}                    → notifications Dashboard (badge non lu, événements globaux)
admin:disputes                   → notifications nouvelles disputes
```

#### Lifecycle d'un message

```
[Client A]  ──▶  POST /aura/conversations.send-message
                     │
                     │ Body: { conversationId, body, idempotencyKey }
                     ▼
              [Aura mutation]
                     │
                     │ 1. validation Zod
                     │ 2. vérification autorisation (A est participant)
                     │ 3. vérification status = open
                     │ 4. db.messages.create({ ..., idempotencyKey })
                     │    (unique violation → retourne row existante R49.1)
                     │ 5. db.conversations.update({ lastMessageAt: now() })
                     │ 6. publishInvalidation({
                     │      keys: ["Message", "Conversation"],
                     │      broadcast: [
                     │        { room: `conversation:${id}`, event: "message:new", payload: { msg } },
                     │        { room: `user:${recipientId}`, event: "unread:bump", payload: { conversationId } },
                     │      ],
                     │   })
                     │ 7. présence check :
                     │    if !isOnline(recipientId, room=`conversation:${id}`):
                     │      ctx.scheduler.runAfter(0, api.notifications.whatsapp-message-aggregate,
                     │        { recipientId, conversationId })
                     ▼
              [Aura broadcast WS server]
                     │
                     ├──▶ [Client A]  (echo own message + ack)
                     └──▶ [Client B]  (display new message live)
```

#### Présence

```ts
// Côté client provider
const auraWS = useAuraBroadcast();
useEffect(() => {
  auraWS.emit("presence:enter", { room: `conversation:${id}` });
  return () => auraWS.emit("presence:leave", { room: `conversation:${id}` });
}, [id]);

// Côté serveur broadcast
on connection: store map<connectionId, { userId, rooms: Set<string> }>
on presence:enter: rooms.add(room)
on presence:leave: rooms.delete(room)
isOnline(userId, room): exists connection with userId where rooms.has(room)
```

#### Indicateurs de lecture

```
when client B opens conversation:
  ws.emit("conversation:read", { conversationId, lastMessageId })
  
server:
  db.messages.updateMany({
    where: { conversationId, senderId: { not: B }, readAt: null, id: { lte: lastMessageId } },
    data: { readAt: now() },
  })
  ws.broadcast(room=`conversation:${conversationId}`, "message:read", { messageIds })
```

### Double opt-in (R24)

```
Workflow match.acceptance:
  step "validate":
      mr = db.match_requests.findUnique(matchRequestId)
      assert mr.status === "pending"
      assert mr.targetId === ctx.user.profileId
  
  step "create-conversation":
      participantA, participantB = sortAlphabetically(mr.requesterId, mr.targetId)
      conv = db.conversations.create({
        participantAId: participantA,
        participantBId: participantB,
        status: "open",
      })
  
  step "update-match-request":
      db.match_requests.update({
        where: { id: matchRequestId },
        data: { status: "accepted", decidedAt: now(), conversationId: conv.id },
      })
  
  step "create-graph-relation":
      ctx.scheduler.runAfter(0, api.graph.upsert-relation, {
        sourceUserId: requesterId, targetUserId: targetId,
        predicate: "connected_to", strength: 0.7,
      })
  
  step "reveal-photos":
      // ctx.storage.grantAccess permet à participantA de voir la photo de participantB
      // et inversement, durant la durée de la conversation
      ctx.storage.grantAccess({ fileId: profileA.photoStorageId, granteeId: profileB.userId, scope: `conversation:${conv.id}` })
      ctx.storage.grantAccess({ fileId: profileB.photoStorageId, granteeId: profileA.userId, scope: `conversation:${conv.id}` })
  
  step "notify-both":
      ctx.scheduler.runAfter(0, api.notifications.whatsapp-send, { recipientId: requesterId, template: "match_accepted" })
      ctx.scheduler.runAfter(0, api.notifications.whatsapp-send, { recipientId: targetId, template: "match_accepted" })
```

Si User_B refuse, `match_requests.status = "refused"`, aucune conversation créée, notification de refus à User_A.

### Snapshot des Disputes (R9.1)

Lorsqu'un participant signale, l'action capture **immutablement** la conversation au moment T :

```ts
// src/operations/disputes/snapshot-builder.action.ts
export default defineOperationFn("disputes.snapshot-builder")
  .action()
  .input(z.object({
    conversationId: z.string().cuid(),
    reporterId: z.string().cuid(),
    reason: z.string().max(120),
    reasonDetail: z.string().max(1000).optional(),
  }))
  .auth()
  .handler(async (ctx, { input }) => {
    const conv = await ctx.runQuery(api.conversations.get-by-id, { id: input.conversationId });
    const allMessages = await ctx.runQuery(api.conversations.list-all-messages, { conversationId: input.conversationId });
    const participants = await ctx.runQuery(api.profiles.get-pair, {
      ids: [conv.participantAId, conv.participantBId]
    });
    
    const snapshot = {
      version: "1.0",
      capturedAt: new Date().toISOString(),
      conversation: { id: conv.id, status: conv.status, createdAt: conv.createdAt.toISOString() },
      participants: participants.map(p => ({
        id: p.id, alias: p.alias, name: p.name, isVerified: p.isVerified,
      })),
      messages: allMessages.map(m => ({
        id: m.id, senderId: m.senderId, kind: m.kind, body: m.body,
        readAt: m.readAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      contextMetadata: {
        ratings: await ctx.runQuery(api.ratings.list-for-conversation, { conversationId: conv.id }),
      },
    };
    
    return await ctx.runMutation(api.disputes.create, {
      conversationId: input.conversationId,
      reporterId: input.reporterId,
      reportedId: conv.participantAId === input.reporterId ? conv.participantBId : conv.participantAId,
      reason: input.reason,
      reasonDetail: input.reasonDetail,
      snapshot,
    });
  });
```

Le `snapshot` est stocké en `disputes.snapshot` JSON immuable. Une politique Postgres (RLS optionnel) interdit toute modification ultérieure.

---

## Sécurité et Conformité

### Authentification

| Concern | Mécanisme | Référence |
|---------|-----------|-----------|
| Auth email/password | Composant Aura `@aura/auth` | R35.1 |
| Hashing | bcryptjs (Aura par défaut) | Aura design |
| Sessions | JWT + cookie httpOnly+Secure+SameSite=lax (Aura) | Aura R6 |
| CSRF | Token HMAC double-cookie (Aura) | Aura R7, R35.2 |
| Rate-limit auth | 10 tentatives/IP/5 min (`@aura/rate-limit`) | R35.5 |
| Révocation globale | `users.session_version` incrémenté à change-password | R35.4 |

### CSRF et webhook

```ts
// src/aura/server/middleware/csrf.ts (cf. Aura design Decision 1)
// Appliqué à /aura/* uniquement.
// /webhooks/* sont configurés .csrf(false) car protégés par HMAC.

// src/operations/webhooks/whatsapp.http.ts
defineHttpAction("/webhooks/whatsapp", "POST")
  .public()
  .csrf(false)                                  // pas de CSRF
  .middleware(verifyHmacWhatsApp)               // HMAC obligatoire
```

### Anonymat (R25)

Génération d'alias :

```ts
// src/operations/profiles/alias-generator.ts
const ADJECTIVES_FR = ["Calme", "Vif", "Agile", "Sage", "Brillant", "Discret", ...];
const NOUNS_FR = ["Cheval", "Aigle", "Lion", "Lynx", "Faucon", "Cerf", ...];

export function generateAlias(language: Language, conversationId: string, userId: string): string {
  const seed = sha256(`${conversationId}:${userId}`);   // déterministe par couple
  const lists = language === "fr"
    ? { adj: ADJECTIVES_FR, noun: NOUNS_FR }
    : { adj: ADJECTIVES_EN, noun: NOUNS_EN };
  const adj = lists.adj[seed.readUInt32LE(0) % lists.adj.length];
  const noun = lists.noun[seed.readUInt32LE(4) % lists.noun.length];
  const suffix = String(seed.readUInt32LE(8) % 10000).padStart(4, "0");
  return `${adj}-${noun}-${suffix}`;                     // R25.5
}
```

L'alias persistant est stocké dans `profiles.alias` (unique global). En contexte d'une `Match_Request pending`, on affiche l'alias ; après acceptation, on révèle nom + photo (R25.2).

### Photos (R36)

```ts
// src/aura/server/storage/access-control.ts
export interface AuraStorageAcl {
  fileId: string;
  ownerId: string;
  publicAccess: boolean;          // toujours false pour photos profil
  grants: Array<{
    granteeId: string;
    scope: string;                // "conversation:{id}" | "admin"
    expiresAt: Date | null;
  }>;
}

export async function getFileUrl(fileId: string, requesterId: string): Promise<string | null> {
  const file = await prisma.AuraFile.findUnique({ where: { id: fileId } });
  if (!file) return null;
  
  const acl = await getAcl(fileId);
  
  if (file.ownerId === requesterId) return signedUrl(file, ttl=300);
  if (isAdmin(requesterId)) return signedUrl(file, ttl=300);
  
  for (const grant of acl.grants) {
    if (grant.granteeId === requesterId && (!grant.expiresAt || grant.expiresAt > new Date())) {
      return signedUrl(file, ttl=300);
    }
  }
  
  return null;                    // 403 forbidden
}
```

Le Bot_WhatsApp ne reçoit jamais l'URL de la photo de l'autre utilisateur (R25.4). Côté Dashboard, l'URL signée est obtenue uniquement via `useAuraQuery(api.profiles.get-by-id-with-photo)` qui retourne null si `requesterId` n'a pas de grant actif.

### Documents identité (Badge_Verifie, R32, R36.3)

Stockage `ctx.storage` avec ACL admin-only :

```ts
ctx.storage.store(file, {
  filename: `kyc-${userId}-${docType}-${Date.now()}.${ext}`,
  contentType: file.type,
  visibility: "private",
  acl: { adminOnly: true },               // jamais accessible aux autres users
  encryption: "at-rest",                   // chiffré au repos
})
```

### RGPD-like (R36.4, R36.5, R38)

#### Workflow `data.export`

```
step "collect":
    user      = users.findUnique(userId)
    profile   = profiles.findUnique(userId)
    services  = services.findMany(profileId)
    matches   = match_requests.findMany([as requester, as target])
    convs     = conversations.findMany(participantA|B)
    messages  = messages.findMany(senderId or in convs)
    ratings   = ratings.findMany(raterId | ratedId)
    payments  = payments.findMany(userId)
    consents  = consents.findMany(userId)
    entities  = entities.findMany(userId)
    relations = relations.findMany([source.userId | target.userId])
    embeddings = graph_embeddings.findMany(metadata.userId == userId)
    llm_logs  = llm_calls.findMany(userIdHash == hashOf(userId))   # filtre par hash

step "package":
    json = serializeUserExport({ ... })           # R23.5 round-trip property
    fileId = ctx.storage.store(json, { filename: `export-${userId}-${date}.json`, visibility: "private", expiresAt: now()+7d })

step "notify":
    notify user with download link, expires in 7 days
```

#### Workflow `data.delete`

```
step "anonymize":
    profiles.update({ name: null, photoStorageId: null, status: "deleted" })
    users.update({ email: hashed(email), phone: null })
    consents.deleteMany(userId)

step "remove-from-graph":
    entities.update({ status: "archived" })
    relations.deleteMany(source or target this user)
    graph_embeddings.delete

step "schedule-purge (30j)":
    ctx.scheduler.runAt(now()+30d, api.users.purge-hard, { userId })

step "purge-hard" (déclenché à T+30j):
    if no open dispute involving user:
        Tables purgées: services, match_requests, ratings de cet user
        Conservation: payments (10 ans CEMAC R38.1), AuraAuditLog
```

### Validation numéros MoMo (R38)

```ts
// src/aura/server/payments/phone-validator.ts
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function validateMobileMoneyPhone(input: string, region: Region): ValidationResult {
  const parsed = parsePhoneNumberFromString(input, region);
  if (!parsed?.isValid()) return { ok: false, error: "INVALID_PHONE_FORMAT" };
  
  const country = parsed.country;
  const national = parsed.nationalNumber;
  
  switch (country) {
    case "CM":
      // MTN MoMo: 67x, 65x | Orange: 69x, 65x
      if (!/^6[5-9]\d{7}$/.test(national)) return { ok: false, error: "NOT_A_MOMO_NUMBER" };
      const operator = /^(67|65)/.test(national) ? "mtn" : "orange";
      return { ok: true, e164: parsed.format("E.164"), operator };
    case "CI":
      // Orange: 07, MTN: 05, Moov: 01 (préfixes simplifiés)
      ...
    default:
      return { ok: false, error: "REGION_NOT_SUPPORTED" };
  }
}
```

### KYC pour Badge_Verifie (R32)

Workflow détaillé en section précédente. Les deux fichiers (selfie + CNI) sont stockés avec `acl.adminOnly: true`, le hash sha256 est conservé pour audit. La décision de revue est journalisée dans `AuraAuditLog`.

### Conformité CEMAC (R38.1)

- Rétention `payments` : 10 ans minimum, jamais purgée par `data.delete` (override RGPD documenté).
- Champs requis (timestamp, montant, devise, providerTransId, userId, status) systématiquement présents.
- Backups quotidiens vers stockage immuable (S3 versioned + bucket lock).

---

## Observabilité IA

### Tracing de bout en bout

Un `correlationId` (UUID v7) est généré au point d'entrée de chaque requête utilisateur :

```
Webhook_WhatsApp        ─▶ correlationId généré
  enqueue worker          ─▶ correlationId propagé dans payload
    Graphe_Agent_User     ─▶ correlationId injecté dans state
      LLM call (Conv)     ─▶ llm_calls.correlation_id = correlationId
      Extraction          ─▶ llm_calls.correlation_id = correlationId
      MatchingIntent      ─▶ llm_calls.correlation_id = correlationId
      OrchestratorCall    ─▶ correlationId propagé via tool input
        Orchestrateur     ─▶ match_sessions.correlation_id = correlationId
          GraphTraversal  ─▶ log.correlation_id
          EmbeddingQuery  ─▶ log.correlation_id
      Response (LLM)      ─▶ llm_calls.correlation_id = correlationId
    Notify whatsapp       ─▶ outbox.payload.correlationId = correlationId
```

Cela permet, depuis le dashboard Admin, de cliquer sur une session matching et de voir tous les llm_calls et les logs Postgres associés.

### Token tracking

```ts
// src/aura/server/ai/llm-tracker.ts
export async function logLlmCall(input: {
  correlationId: string;
  userId: string | null;
  node: LlmNode;
  provider: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  costUsd?: number;
  status: "ok" | "error" | "filtered" | "fallback";
  errorMessage?: string;
}) {
  await prisma.llm_calls.create({
    data: {
      correlationId: input.correlationId,
      userIdHash: input.userId ? hmacUserId(input.userId) : null,    // R42.5
      node: input.node, provider: input.provider, model: input.model,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
      latencyMs: input.latencyMs,
      costUsd: input.costUsd,
      status: input.status,
      errorMessage: input.errorMessage,
    },
  });
  
  // Métriques Prometheus
  auraMetrics.observe("aura_llm_tokens_total", { model: input.model, node: input.node }, input.usage.totalTokens);
  if (input.costUsd) auraMetrics.observe("aura_llm_cost_usd_total", { model: input.model }, input.costUsd);
}

function hmacUserId(userId: string): string {
  return createHmac("sha256", LLM_LOG_SALT).update(userId).digest("hex").slice(0, 32);
}
```

### Quality tracking

```
match.session-end action:
    1. db.match_sessions.create({
         id, userIdHash, region, intent, queryHash,
         profilesProposed: [...], graphLatencyMs, vectorLatencyMs, totalLatencyMs,
         cacheHit, correlationId,
       })
    2. ctx.scheduler.runAt(now()+24h, api.analytics.assess-quality, { sessionId })

quality cron quotidien:
    For each match_session of last 30 days:
        ratings = db.ratings.findMany({
            where: { conversation: { matchRequest: { matchSessionId: session.id } } },
        })
        positiveRatings = ratings.filter(r => r.score >= 4).length
        match_sessions.update({ ratingsAfter: ratings.map(r => ({ id, score, comment })) })
    
    Compute global metric:
        match_quality_score = positiveRatings / totalRatings (R42.4)
        Save to business_config.MATCH_QUALITY_30D
```

### Dashboards Admin (Recharts)

| Dashboard | Source | Visualisation |
|-----------|--------|---------------|
| Tokens par jour / model | `llm_calls` aggregée par `date_trunc('day', createdAt)`, model | AreaChart stacked |
| Coût USD par jour | idem, sum(costUsd) | BarChart |
| Latence p50/p95/p99 par node | `llm_calls.latencyMs` percentile par `node`, fenêtre 7 jours | LineChart |
| Match quality (rolling 30j) | `business_config.MATCH_QUALITY_30D` | KPI card + sparkline |
| Disputes ouvertes/résolues | `disputes` aggregé par status | DonutChart |
| Match latency p95 | `match_sessions.totalLatencyMs` | Histogram |

### Logging structuré

Aura logger (cf. design Aura) configuré pour émettre du JSON avec niveau, message, `correlationId`, `userId` (hashé pour les flux IA), `requestId`, `operationName`. Exemple d'entrée :

```json
{
  "ts": "2025-01-20T14:32:11.234Z",
  "level": "info",
  "msg": "graph_traversal completed",
  "correlationId": "01HM4Q2M7N8P9R...",
  "operation": "matching.orchestrator",
  "graphLatencyMs": 412,
  "candidatesFound": 38,
  "depth": 3
}
```

Export Prometheus exposé via endpoint `/aura-internal/metrics` (gated par `AURA_INTERNAL_SECRET`), scrapé par un Prometheus latéral en infrastructure.

---

## Performances

### Cibles (R41)

| Mesure | Cible p95 | Cible p99 | Origine |
|--------|-----------|-----------|---------|
| Latence Bot_WhatsApp end-to-end (réception → réponse) | < 3 min | < 5 min | R41.1 |
| Graph_Traversal seul | < 800 ms | < 1500 ms | R41.2 |
| EmbeddingQuery seul | < 300 ms | < 600 ms | R41.3 |
| Orchestrateur_Matching total (sans LLM) | < 1.5 s | < 2.5 s | dérivé R41 |
| Chat send → broadcast | < 500 ms | < 1 s | R27.1 |
| Webhook ACK | < 200 ms | < 500 ms | R29 implicite |

### Stratégie de cache

```
Redis keys:

agent:hydration:{userId}                             ttl 60s    profile + services snapshot
matching:cache:{userIdHash}:{queryHash}:{region}     ttl 60s    Orchestrateur result (R41.4)
profile:alias:{userId}:{conversationId}              ttl 24h    alias déterministe
embedding:query:{queryHash}                          ttl 5min   embedding de la requête
ratelimit:whatsapp:{userId}                          ttl 60s    R44.1
ratelimit:matching:{userId}                          ttl 24h    R44.3
business_config                                      ttl 30s    BUSINESS_PHASE flag
```

`queryHash = sha256(JSON.stringify(constraints))` — permet de mutualiser les requêtes équivalentes.

### Indexation Postgres

Tous les `CREATE INDEX` sont émis avec `CONCURRENTLY` dans les migrations, sauf au premier déploiement (table vide) :

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_region_status_idx
  ON profiles (region, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS relations_predicate_source_idx
  ON relations (predicate, source_entity_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS relations_predicate_target_idx
  ON relations (predicate, target_entity_id);
```

L'index HNSW pgvector est créé une seule fois (pas de support CONCURRENTLY HNSW en pgvector < 0.7) avec `m = 16, ef_construction = 64` (compromis recommandé pour 1M+ vecteurs).

### Embedding generation (worker dédié)

```
Aura outbox pattern:

on entity.create | profile.update | service.update:
    db.AuraOutboxEvent.create({
      type: "graph.regenerate-embedding",
      payload: { entityId, reason },
      maxAttempts: 6,
    })

processOutboxEvents (cron toutes les 5s):
    batch = up to 50 events of type "graph.regenerate-embedding"
    For each event:
      try:
        text = buildEmbeddingText(entity)        # concatène value + skills + bio
        embedding = await llmRouter.forEmbedding().embed(text)
        db.graph_embeddings.upsert({ where: { entity }, embedding, metadata: {...} })
        db.AuraOutboxEvent.update({ status: "SUCCEEDED", processedAt: now() })
      catch err:
        db.AuraOutboxEvent.update({
          attempts: attempts+1,
          nextRunAt: now() + min(2^attempts * 1000, 60*60*1000),       # exponential backoff capped 60min
          error: String(err),
          status: attempts+1 >= maxAttempts ? "FAILED" : "PENDING",
        })
```

Le worker peut être extrait en service séparé (`aura-embedding`) pour scaling horizontal en phase 2.

### Pagination cursor

Conformément à la décision Aura 18, toutes les listes (services, conversations, messages, matches) utilisent une pagination cursor opaque :

```ts
defineOperationFn("conversations.list-mine")
  .query()
  .input(z.object({
    cursor: z.string().optional(),
    numItems: z.number().min(1).max(50).default(20),
  }))
  .auth()
  .handler(async (ctx, { input }) => {
    return ctx.paginate(ctx.db.conversations, {
      where: { participantAId: ctx.user.profileId } /* OR participantBId */,
      orderBy: { lastMessageAt: "desc" },
      cursor: input.cursor, take: input.numItems,
    });
    // → { items, cursor: nextCursor | null, isDone: boolean }
  });
```

Encodage : `base64url(JSON.stringify({ id, lastMessageAt }))` avec HMAC pour empêcher la forge.

### Rate-limiting (R44)

| Cible | Limite | Fenêtre | Mécanisme |
|-------|--------|---------|-----------|
| WhatsApp messages par utilisateur | 60 | 1 min | Redis bucket clé `ratelimit:wa:user:{userId}` |
| Webhook Fapshi par IP | 100 | 1 min | `@aura/rate-limit` (R29.6) |
| Webhook WhatsApp par IP | 100 | 1 min | idem |
| Match_Request en mvp | 20 | 24 h | `@aura/rate-limit` |
| Match_Request en freemium gratuit | 50 | 24 h | idem |
| Match_Request avec Pro | 500 | 24 h | idem |
| Auth login par IP | 10 | 5 min | R35.5 |

---

## Déploiement

### MVP — VPS unique (Docker compose)

```yaml
# docker-compose.yml (extrait)
services:
  aura-app:
    image: ghcr.io/aura/whatsapp-matchmaking:${VERSION}
    env_file: .env.production
    ports: ["3000:3000"]
    depends_on: [postgres, redis, evolution-api]
    restart: unless-stopped
    command: bun src/server.ts

  postgres:
    image: pgvector/pgvector:pg16
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: aura
      POSTGRES_USER: aura
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aura"]

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]
    command: ["redis-server", "--appendonly", "yes"]

  evolution-api:
    image: atendai/evolution-api:v2
    volumes: ["evolution_instances:/evolution/instances"]
    environment:
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
      WEBHOOK_GLOBAL_URL: https://app.example.com/webhooks/whatsapp
      WEBHOOK_GLOBAL_ENABLED: "true"

volumes:
  pgdata:
  redisdata:
  evolution_instances:
```

### CI/CD

```yaml
# .github/workflows/deploy.yml (extrait)
name: deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: pgvector/pgvector:pg16 }
      redis: { image: redis:7-alpine }
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run db:migrate deploy
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test --run

  build-image:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with: { tags: ghcr.io/aura/whatsapp-matchmaking:${{ github.sha }} }

  deploy:
    needs: build-image
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        run: ssh deploy@$VPS_HOST "cd /srv/aura && docker compose pull && docker compose up -d"
      - name: Run migrations
        run: ssh deploy@$VPS_HOST "docker compose exec aura-app bun run db:deploy"
      - name: Smoke test
        run: curl --fail https://app.example.com/health
```

### Secrets

```
.env.production (ne JAMAIS commit)
  DATABASE_URL              postgres://aura:****@postgres/aura
  AURA_INTERNAL_SECRET      32 bytes hex
  AURA_CSRF_SECRET          32 bytes hex
  EVOLUTION_API_KEY         généré côté Evolution
  FAPSHI_API_USER, FAPSHI_API_KEY, FAPSHI_WEBHOOK_SECRET
  FLUTTERWAVE_SECRET_KEY    (phase 3)
  LLM_PROVIDER              "openai"
  LLM_MODEL                 "gpt-4o-mini" (Conversation), "gpt-4o" (Extraction sensible)
  LLM_API_KEY               sk-***
  EMBEDDING_MODEL           "text-embedding-3-small"
  WHATSAPP_BUSINESS_TOKEN   (phase 2+)
  S3_BACKUP_BUCKET          aura-backups
  LLM_LOG_SALT              32 bytes pour HMAC userId hashing
```

Rotation manuelle ; pas de KMS au MVP, à introduire en phase 2 (AWS Secrets Manager ou Hashicorp Vault).

### Backup PostgreSQL

```bash
# scripts/backup-postgres.sh — exécuté quotidien via cron host
#!/bin/bash
set -euo pipefail
DATE=$(date +%Y%m%d_%H%M%S)
docker compose exec -T postgres pg_dump -U aura -Fc aura | \
  aws s3 cp - s3://aura-backups/postgres/aura-$DATE.dump \
  --storage-class STANDARD_IA
# Retention 30 jours via lifecycle policy S3
```

Tables critiques sauvegardées : `entities`, `relations`, `graph_embeddings`, `messages`, `payments`, `disputes`, `users`, `profiles`, `services`, `match_sessions`, `llm_calls` (R45.5).

### Scaling path (phase 2+)

```
                                  ┌─────────────────┐
                                  │  Load balancer  │
                                  │  (Caddy/Nginx)  │
                                  └────────┬────────┘
                                           │
                  ┌────────────────────────┼────────────────────────┐
                  │                        │                        │
            ┌─────▼─────┐            ┌─────▼─────┐            ┌─────▼─────┐
            │ aura-web 1│            │ aura-web 2│            │ aura-web 3│
            │ (TanStack │            │           │            │           │
            │  + Hono)  │            │           │            │           │
            └─────┬─────┘            └─────┬─────┘            └─────┬─────┘
                  │                        │                        │
                  └────────────────┬───────┴────────────────────────┘
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        │                                                     │
   ┌────▼────────┐    ┌────────────────┐    ┌────────────────▼──┐
   │ aura-worker │    │ aura-embedding │    │ aura-broadcast    │
   │ (outbox,    │    │ worker         │    │ (existant Hono)   │
   │  scheduler, │    │                │    │                   │
   │  agent_user)│    │                │    │                   │
   └─────┬───────┘    └────────┬───────┘    └─────────┬─────────┘
         │                     │                       │
         └─────────────────────┼───────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Postgres (primary) │
                    │  + read replicas    │
                    │  Redis cluster      │
                    └─────────────────────┘
```

Extraction prioritaire des services lourds : (1) `aura-embedding` (génération embeddings synchrone vers OpenAI), (2) `aura-worker` (Outbox + Orchestrateur_Matching), (3) `aura-broadcast` (déjà standalone).

---

## Gestion des erreurs

### Codes d'erreur métier (R46)

```ts
// src/aura/core/errors.ts (extension Aura)
export const MatchmakingErrorCodes = {
  // Validation
  INVALID_PHONE_FORMAT: { status: 400 },
  PROFILE_INCOMPLETE: { status: 400 },
  WHITESPACE_INPUT: { status: 400 },
  
  // Métier
  WHATSAPP_NOT_LINKED: { status: 400 },
  PHONE_ALREADY_LINKED: { status: 409 },
  LINK_CODE_EXPIRED: { status: 410 },
  LINK_CODE_INVALID: { status: 404 },
  SERVICE_QUOTA_EXCEEDED: { status: 402 },         // requiert Pro
  MATCH_REQUEST_ALREADY_PENDING: { status: 409 },
  MATCH_REQUEST_NOT_FOUND: { status: 404 },
  MATCH_REQUEST_EXPIRED: { status: 410 },
  CANNOT_RATE_NON_PARTICIPANT: { status: 403 },
  ALREADY_RATED: { status: 409 },
  CONVERSATION_CLOSED: { status: 410 },
  BOOST_ALREADY_ACTIVE: { status: 409 },
  
  // Paiement
  PAYMENT_UNAVAILABLE: { status: 503 },             // R28.5
  PAYMENT_DECLINED: { status: 402 },
  WEBHOOK_SIGNATURE_INVALID: { status: 401 },
  
  // IA
  LLM_PROVIDER_DOWN: { status: 503 },
  LLM_FILTERED: { status: 451 },                    // contenu refusé par safety filters
  EXTRACTION_PARSE_FAILED: { status: 500 },
  PERSONA_GUARDRAIL_VIOLATED: { status: 500 },      // 3 essais échoués
  ORCHESTRATOR_TIMEOUT: { status: 504 },
  
  // Modération
  ACCOUNT_SUSPENDED: { status: 403 },
  REGION_DISABLED: { status: 403 },
} as const;
```

Toutes les erreurs renvoyées au client respectent l'enveloppe Aura :

```json
{
  "ok": false,
  "error": {
    "code": "MATCH_REQUEST_ALREADY_PENDING",
    "message": "Une demande est déjà en attente avec ce profil",
    "status": 409,
    "requestId": "01HM4Q...",
    "fieldErrors": null
  }
}
```

### Erreurs LLM

```
LLM call timeout (30s) → bascule provider de secours (R43.4) → si échec aussi → fallback message persona
LLM safety filter blocked → log llm_calls.status = "filtered" → fallback message persona (R43.5)
LLM JSON parse fail (Extraction) → retry 3 fois avec prompt durci → log error → tour ignoré (R23.4)
LLM rate-limit (429) → backoff exponentiel → bascule provider de secours après 3 échecs
```

### Erreurs Webhook

| Cas | Réponse | Side effect |
|-----|---------|-------------|
| Signature HMAC invalide | 401 | log warn, métrique `webhook_signature_invalid` |
| Body non parsable | 400 | conserver en `whatsapp_inbox` avec `parsedOk=false` |
| Évènement déjà traité | 200 (idempotent) | aucun effet |
| Erreur DB | 500 | retry Evolution_API → re-tentative future |
| Rate-limit dépassé | 429 + Retry-After | bloquer IP suspect |

### Pas d'exposition d'internals (R46.3)

`AuraError` ne renvoie jamais le message brut d'erreur Postgres ou de stack-trace en production. Le mapping standard se fait dans `runner.ts` :

```ts
catch (err) {
  if (err instanceof AuraError) throw err;
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === "P2002") throw new AuraError("CONFLICT", "Resource already exists", { status: 409 });
    if (err.code === "P2025") throw new AuraError("NOT_FOUND", "Resource not found", { status: 404 });
  }
  if (err instanceof ZodError) throw new AuraError("VALIDATION_ERROR", "Validation failed", { status: 422, fieldErrors: zodToFieldErrors(err) });
  
  log.error({ err, requestId }, "unexpected operation failure");
  throw new AuraError("INTERNAL_ERROR", "Internal server error", { status: 500 });   // pas de détail
}
```

---

## Correctness Properties

*Une propriété est un comportement ou une caractéristique qui doit rester vrai pour toute exécution valide du système — une affirmation formelle de ce que le logiciel doit faire. Les propriétés font le pont entre les spécifications lisibles et les garanties de correction vérifiables par machine.*

Cette section formalise sous forme de propriétés universellement quantifiées les critères du document `requirements.md` qui ont été classés `PROPERTY` lors du prework. Les critères classés `EXAMPLE` (cas spécifiques), `EDGE_CASE` (cas-limites couverts par les générateurs), `INTEGRATION` (tests d'infrastructure) ou `SMOKE` (validation de configuration) sont traités dans la section **Stratégie de tests** et non ici.

Chaque propriété est testable via property-based testing (cf. décision Aura 24 + R47). Le projet utilise **fast-check** comme bibliothèque de PBT côté TypeScript, intégrée aux tests Vitest.

### Round-trip properties

#### Propriété 1 : Round-trip de sérialisation des entités

*Pour toute* entité `e` validée par le schéma `Entity` (Zod discriminated union sur `type`), `parseEntity(serializeEntity(e))` produit un objet structurellement équivalent à `e` (égalité profonde sur tous les champs sérialisés).

**Validates: Requirements 23.2**

#### Propriété 2 : Round-trip de sérialisation des relations

*Pour toute* relation `r` validée par le schéma `Relation` (avec `predicate ∈ {provides, requires, located_in, looks_for, matches, connected_to, rated}`), `parseRelation(serializeRelation(r))` produit un objet structurellement équivalent à `r`.

**Validates: Requirements 23.3**

#### Propriété 3 : Round-trip de l'export sous-graphe utilisateur

*Pour tout* sous-graphe utilisateur `g = { entities[], relations[], embeddings[] }` valide, `parseUserExport(serializeUserExport(g))` reconstitue un objet équivalent (entités triées par id, relations triées par `(source, predicate, target)`, embeddings comparés par norme L2 < 1e-6).

**Validates: Requirements 23.5**

#### Propriété 4 : Round-trip de parsing des messages WhatsApp

*Pour tout* `WhatsAppMessage` valide produit par `parseWhatsAppMessage`, `parseWhatsAppMessage(serializeWhatsAppMessage(msg))` produit un objet équivalent à `msg`.

**Validates: Requirements 48.3**

#### Propriété 5 : Round-trip persistance/récupération de l'état agent

*Pour tout* `AgentUserState` valide, `loadAgentState(saveAgentState(state))` produit un état équivalent à `state` (la version est éventuellement incrémentée mais le contenu sémantique est identique).

**Validates: Requirements 13.4, 12.4**

### Propriétés de validation et d'invariant de schéma

#### Propriété 6 : Validation universelle des inputs Zod

*Pour toute* opération Aura exposée et tout input invalide selon son schéma Zod, l'opération retourne `AuraError("VALIDATION_ERROR", { fieldErrors })` avec `fieldErrors` couvrant tous les chemins en violation, et n'effectue aucune mutation d'état.

**Validates: Requirements 46.1**

#### Propriété 7 : Bornes de longueur des champs profil

*Pour toute* chaîne candidate, `profile.update` accepte la valeur ssi sa longueur respecte les bornes (`name ≤ 80`, `bio ≤ 1000`) ; si l'une dépasse, l'opération échoue avec `VALIDATION_ERROR` et l'état précédent est préservé.

**Validates: Requirements 4.3**

#### Propriété 8 : Validation des photos uploadées

*Pour tout* fichier candidat, `profile.upload-photo` accepte la photo ssi `mimeType ∈ {png, jpg, jpeg, webp}` et `size ≤ 5 MiB` ; sinon retourne une erreur structurée avec un code distinct par cause de rejet.

**Validates: Requirements 4.4**

#### Propriété 9 : Format et limite des messages chat

*Pour tout* texte candidat, `conversations.send-message` accepte le message ssi `0 < length ≤ 4000` ; sinon retourne `VALIDATION_ERROR`.

**Validates: Requirements 27.2**

#### Propriété 10 : Format et déterminisme de l'alias

*Pour tout* couple `(userId, conversationId)`, `generateAlias(language, conversationId, userId)` produit une chaîne respectant la regex `^[A-Za-zÀ-ÿ]+-[A-Za-zÀ-ÿ]+-\d{4}$` et est **déterministe** (deux appels consécutifs avec mêmes arguments retournent la même chaîne).

**Validates: Requirements 25.5**

#### Propriété 11 : Génération du code de liaison WhatsApp

*Pour toute* inscription, le code généré respecte la regex `^[A-Z0-9]{8}$` et est **unique** dans la fenêtre des codes actifs (non expirés et non consommés).

**Validates: Requirements 1.3**

### Propriétés du Knowledge Graph

#### Propriété 12 : Confidence faible déclenche pending_review et exclusion du traversal

*Pour toute* entité `e` avec `e.confidence < 0.5`, le système persiste `e.status = "pending_review"` et l'algorithme `Graph_Traversal` n'inclut **jamais** `e` dans les chemins explorés tant que `e.status ≠ "active"`.

**Validates: Requirements 17.5, 18.2**

#### Propriété 13 : Idempotence et renforcement de l'extraction

*Pour toute* paire d'extractions consécutives produisant la même entité `(userId, type, normalized(value))`, la table `entities` contient **exactement une** ligne pour cette clé, et sa `confidence` après la 2e extraction est ≥ confidence après la 1re (renforcement monotone borné à 1.0 selon la formule `1 - (1-a)(1-b)`).

**Validates: Requirements 18.3**

#### Propriété 14 : Génération obligatoire d'embedding pour toute nouvelle entité

*Pour toute* entité créée avec `status = "active"` et embedding manquant, le système enqueue dans les 0 ms un job `graph.regenerate-embedding`, et après exécution réussie, `graph_embeddings` contient une ligne avec `embedding` de dimension exactement 1536.

**Validates: Requirements 18.6**

#### Propriété 15 : Bornes de profondeur et de chemins du Graph_Traversal

*Pour tout* graphe et tout seed, `Graph_Traversal(seed, region, maxDepth=3, maxPaths=10000)` retourne un ensemble de chemins dont **chacun** a une longueur ≤ 3 et dont la cardinalité totale est ≤ 10 000, en utilisant exclusivement des prédicats de l'enum `RelationPredicate`.

**Validates: Requirements 19.1, 19.2, 19.4**

#### Propriété 16 : Score de chemin = produit des strengths × decay

*Pour tout* chemin `p = (r1, r2, ..., rn)` retenu par le Graph_Traversal, `score(p) = (∏ ri.strength) × 0.85^n × penalty(p)` où `penalty(p) = 0.5` si `p` contient une relation `rated` avec `strength < 0.3`, sinon `1.0`.

**Validates: Requirements 19.3, 19.5**

#### Propriété 17 : Mapping rating → relation strength

*Pour toute* notation de score `s ∈ {1,2,3,4,5}`, la relation `rated` créée ou mise à jour a une `strength` égale à `(s - 1) / 4` (i.e. `1→0.0, 2→0.25, 3→0.5, 4→0.75, 5→1.0`).

**Validates: Requirements 7.3, 22.3**

#### Propriété 18 : Intégrité référentielle des relations

*Pour toute* relation insérée dans la table `relations`, ses `sourceEntityId` et `targetEntityId` référencent obligatoirement des lignes existantes dans `entities` (FK enforced) ; toute tentative de violation est rejetée par PostgreSQL.

**Validates: Requirements 17.3**

### Propriétés du matching

#### Propriété 19 : Formule RRF pour HybridScoring

*Pour tout* couple `(graphRanked, vectorRanked)` produit par les deux sources, le score RRF d'un candidat `c` vaut `weights.graph / (k + rankGraph(c)) + weights.vector / (k + rankVector(c))` avec `k = 60`, `rankGraph(c) = +∞` si `c ∉ graphRanked` (et idem pour vector). Les scores normalisés finaux sont ∈ [0, 1] après division par le max.

**Validates: Requirements 20.4, 20.5**

#### Propriété 20 : Bonus Badge_Verifie multiplicatif

*Pour tout* candidat `c` avec `profile.isVerified = true`, son score final après HybridScoring est exactement `rrf(c) × 1.10` ; pour les autres, le bonus est `1.0`.

**Validates: Requirements 21.4**

#### Propriété 21 : Composition du Diversity_Mix

*Pour tout* `scoredList` non vide produit par HybridScoring, l'output `Diversity_Mix` retourne entre 0 et 5 candidats tels que :
1. au moins 2 candidats viennent du quartile supérieur Q3 (slot "high") s'ils existent ;
2. au moins 1 candidat vient du quartile médian Q2..Q3 (slot "mid") s'il existe ;
3. **chaque candidat apparaît au plus une fois** (unicité par `userId`) ;
4. si un Boost actif candidat `b` satisfait la requête et `b.normalized ≥ q1`, alors `b` occupe au moins le top 3 des résultats.

**Validates: Requirements 21.1, 21.3, 21.5**

#### Propriété 22 : Application stricte des filtres d'exclusion

*Pour tout* `MatchingRequest(requesterId, region, ...)`, l'output `Orchestrateur_Matching.profiles[]` ne contient :
- aucun profil avec `userId == requesterId` ;
- aucun profil avec `status ≠ "active"` ;
- aucun profil ayant un `MATCHES` ou `connected_to` avec `requesterId` daté de moins de 30 jours ;
- aucun profil bloqué explicitement par `requesterId` ;
- aucun profil dont la `region` diffère de `request.region` *sauf* si `request.constraints.expandRegion = true` ;
- aucun profil dans une région dont aucun `PaymentProvider` n'est configuré, lorsque `BUSINESS_PHASE ∈ {freemium, commission}`.

**Validates: Requirements 20.2, 21.2, 50.1, 50.2, 50.3**

#### Propriété 23 : Cardinalité maximale du résultat de matching

*Pour toute* requête, `Orchestrateur_Matching.profiles.length ≤ 5` (R15.1) ; et au sein de l'orchestrateur, `GraphTraversal` retourne au plus 50 candidats et `EmbeddingQuery` au plus 50 candidats (R19.4, R20.3).

**Validates: Requirements 15.1, 19.4, 20.3**

#### Propriété 24 : Cache hit pour requêtes équivalentes dans la fenêtre TTL

*Pour toute* paire de `MatchingRequest` ayant le même `(requesterId, queryHash, region)` séparées de moins de 60 secondes, la 2e exécution retourne **le même résultat** que la 1re et `match_sessions.cacheHit = true`.

**Validates: Requirements 41.4**

### Propriétés Persona et Bot

#### Propriété 25 : Aucune violation persona dans les réponses Bot

*Pour toute* réponse générée par `Graphe_Agent_User` après le `ResponseNode`, l'application de `applyGuardrail(reply, language)` retourne `{ ok: true }` ; sinon, soit la réponse a été régénérée jusqu'à conformité (≤ 2 essais), soit elle a été remplacée par le fallback prédéfini de la même langue (R11.4).

**Validates: Requirements 11.2, 11.3, 11.4**

#### Propriété 26 : Confinement des PII dans les sorties Bot

*Pour toute* réponse Bot transmise via WhatsApp, le corps du message ne contient **aucun** des éléments suivants concernant des tiers : numéro de téléphone (`/\+?\d{10,}/`), email (`/[\w.+-]+@[\w-]+\.[\w.-]+/`), adresse précise, URL de photo de profil.

**Validates: Requirements 15.4, 25.4, 36.2**

#### Propriété 27 : Cloisonnement des données privées dans les API publiques

*Pour toute* `Aura_Operation` exposée publiquement (queries `.public()` ou autres), la réponse JSON ne contient **jamais** les champs `users.email`, `users.phone`, `users.passwordHash`, ni l'`storage_id` d'un document d'identité (selfie, CNI), à l'exception des opérations explicitement administratives.

**Validates: Requirements 25.1, 25.3, 36.1**

#### Propriété 28 : Détection de langue et fallback

*Pour tout* texte d'entrée et historique, `detectLanguage(text, history)` retourne `language ∈ {"fr", "en"}` ; si la confiance est < 0.8, le système utilise `agent_states.language` comme fallback ; si aucun précédent n'existe, retourne `fr` par défaut.

**Validates: Requirements 12.1, 12.2, 12.3, 12.4**

### Propriétés du flow Match_Request et Conversations

#### Propriété 29 : Création Match_Request laisse la conversation absente

*Pour toute* `match.create-request` réussie, `match_request.status = "pending"`, `match_request.conversationId = null`, et aucune ligne dans `conversations` n'est créée.

**Validates: Requirements 24.1, 24.4**

#### Propriété 30 : Acceptation crée la conversation atomiquement

*Pour toute* `match.accept-request(matchRequestId)` réussie, à la fin du workflow `match.acceptance` :
- `match_requests.status = "accepted"` ;
- une `conversations` row est créée avec `participantA = min(requesterId, targetId)`, `participantB = max(...)`, `status = "open"` ;
- `match_requests.conversationId` pointe vers la nouvelle conversation ;
- une relation `connected_to` est insérée dans le graph entre les deux users.

**Validates: Requirements 6.4, 24.2**

#### Propriété 31 : Refus n'ouvre jamais de conversation

*Pour toute* `match.refuse-request` réussie, `match_request.status = "refused"`, et il n'existe **aucune** `conversations` row pour ce match.

**Validates: Requirements 24.3**

#### Propriété 32 : Expiration des match_requests pendantes

*Pour toute* `match_requests` avec `status = "pending"` et `createdAt < now() - 14 jours`, le cron `match.expire-pending` la met en `status = "expired"` ; aucune conversation n'est créée.

**Validates: Requirements 24.5**

#### Propriété 33 : Conversation closed est en lecture seule

*Pour toute* `conversation` avec `status = "closed"`, toute tentative de `conversations.send-message` retourne `CONVERSATION_CLOSED` et l'état des messages reste inchangé.

**Validates: Requirements 8.4**

#### Propriété 34 : Une notation par conversation par utilisateur

*Pour tout* couple `(conversationId, raterId)`, il existe au plus une ligne dans `ratings` ; toute 2e tentative est rejetée avec `ALREADY_RATED`.

**Validates: Requirements 7.5**

#### Propriété 35 : Snapshot de Dispute fidèle au moment T

*Pour toute* `dispute.report(conversationId, t)`, le `snapshot` capturé contient **exactement** la liste des `messages.id` de cette conversation où `createdAt ≤ t`, dans le même ordre, avec les mêmes `body` et `senderId` (capture immutable).

**Validates: Requirements 9.1**

### Propriétés de modération et autorisation

#### Propriété 36 : Suspension automatique au 3e avertissement

*Pour tout* `profiles` avec `warning_count` initial `c < 3`, après une décision Admin de type `warn_*` qui incrémente `c` à `c+1` :
- si `c+1 < 3` : `status` reste `active` ;
- si `c+1 ≥ 3` : `status` devient `suspended` (atomicité avec le warning).

**Validates: Requirements 9.4, 9.5**

#### Propriété 37 : Quota de matching selon plan et phase

*Pour tout* utilisateur dans une fenêtre 24h, le nombre de `match.create-request` autorisées vaut :
- 20 si `BUSINESS_PHASE = "mvp"` ;
- 50 si `BUSINESS_PHASE ∈ {"freemium","commission"}` et l'utilisateur n'a pas de `subscriptions.plan = "pro" with status = "active"` ;
- 500 si l'utilisateur a une subscription Pro active.

Dépassement → `RATE_LIMITED` avec `retry_after_seconds` indicatif.

**Validates: Requirements 30.2, 31.6, 44.3, 44.4, 44.5**

#### Propriété 38 : Quota de services pour utilisateurs gratuits

*Pour tout* prestataire sans subscription Pro active, après création du 50e service actif, toute tentative de `services.create` retourne `SERVICE_QUOTA_EXCEEDED` ; un prestataire Pro n'a pas de plafond.

**Validates: Requirements 5.4**

#### Propriété 39 : Authorization participant pour notation

*Pour toute* `ratings.submit(conversationId, raterId)`, l'opération retourne `CANNOT_RATE_NON_PARTICIPANT` ssi `raterId ∉ {conversation.participantAId, conversation.participantBId}`.

**Validates: Requirements 7.4**

#### Propriété 40 : Accès Admin_Console restreint

*Pour toute* opération exposée sous le prefix `admin.*`, l'appel échoue avec `FORBIDDEN` ssi `ctx.user.role ≠ "admin"`.

**Validates: Requirements 10.1**

### Propriétés de paiement et idempotence

#### Propriété 41 : Idempotence des opérations critiques par Idempotency-Key

*Pour toute* paire d'appels `match.create-request`, `chat.send-message` ou `payment.initiate-*` avec le même header `Idempotency-Key` dans une fenêtre de 24h, la 2e réponse est **strictement identique** à la 1re (même `requestId` dans l'envelope ou flag `meta.replayed = true`), et **aucune** seconde mutation d'état n'est appliquée (compté par incrément de `messages`, `match_requests`, `payments`).

**Validates: Requirements 49.1**

#### Propriété 42 : Idempotence des webhooks de paiement

*Pour tout* webhook Fapshi (resp. Flutterwave) avec un `providerTransId` déjà associé à un `payments.status = "succeeded"`, la nouvelle requête retourne HTTP 200 sans modifier `payments`, sans réémettre de notification WhatsApp et sans ré-activer un produit (Badge/Boost/Pro).

**Validates: Requirements 29.5, 49.2**

#### Propriété 43 : Idempotence d'envoi WhatsApp par message_id

*Pour tout* envoi sortant d'une notification WhatsApp avec retries internes, le message reçu par l'utilisateur est unique côté provider (même `providerMessageId` propagé dans tous les retries), garantissant qu'aucun doublon n'est délivré.

**Validates: Requirements 49.3**

#### Propriété 44 : Mapping region → PaymentProvider

*Pour tout* utilisateur de `region ∈ {CM, CI, SN, BF}`, `paymentProviderFactory.forRegion(region)` retourne le provider attendu (CM → fapshi, autres → flutterwave) ; pour toute région non configurée, `payment.initiate` retourne `PAYMENT_UNAVAILABLE`.

**Validates: Requirements 28.3, 28.5, 40.3**

#### Propriété 45 : Activation produit conditionnée au succès paiement

*Pour tout* `payment` avec `type ∈ {badge, boost, pro}`, le produit n'est activé (boost créé, sub créée, workflow vérification démarré) **que si** `payment.status = "succeeded"` ET aucune activation antérieure n'existe pour ce `payment.id` (idempotence du workflow `payment.activate-product`).

**Validates: Requirements 29.4, 31.2, 31.3, 31.4**

#### Propriété 46 : Boost actif → durée 7 jours exacts

*Pour tout* `boost.purchase`, `boost.endsAt - boost.startsAt = 7 × 24h` (à la milliseconde près), `boost.startsAt = paymentSucceededAt`, et un job de fin via `ctx.scheduler.runAt(endsAt, ...)` est enregistré.

**Validates: Requirements 31.2**

#### Propriété 47 : Subscription Pro 30 jours et scheduler de renouvellement

*Pour toute* `subscriptions.create` réussie pour le plan `pro`, `endsAt = startsAt + 30 jours`, et deux jobs sont enregistrés : un rappel à `endsAt - 7 jours` et un renouvellement à `endsAt`.

**Validates: Requirements 31.3, 34.1, 34.2**

### Propriétés d'observabilité

#### Propriété 48 : Stabilité du hash HMAC userId pour les logs IA

*Pour tout* `userId`, `hmacUserId(userId)` retourne une chaîne déterministe de 32 caractères hex, et **différents** userIds produisent des hash distincts avec une probabilité écrasante (collision improbable sur les espaces de userIds réels).

**Validates: Requirements 42.5**

#### Propriété 49 : Propagation du correlationId de bout en bout

*Pour tout* `correlationId` généré par `Webhook_WhatsApp`, toutes les lignes suivantes partagent ce même `correlationId` :
- toutes les `llm_calls` produites par les nodes du `Graphe_Agent_User` pour ce tour ;
- la `match_session` associée s'il y a eu matching ;
- les `AuraOutboxEvent` de notifications WhatsApp sortantes liées au tour.

**Validates: Requirements 45.2**

#### Propriété 50 : Comptabilité tokens fidèle

*Pour tout* appel LLM logué dans `llm_calls`, `total_tokens = prompt_tokens + completion_tokens` et l'agrégat quotidien par `(node, model)` égale la somme des lignes de la fenêtre.

**Validates: Requirements 42.1, 42.2**

#### Propriété 51 : Métrique de qualité du matching

*Pour toute* fenêtre 30 jours, le `match_quality_score` calculé vaut `count(ratings where score >= 4 AND createdAt in window) / count(ratings where createdAt in window)`, ou `null` si dénominateur est zéro.

**Validates: Requirements 42.4**

### Propriétés de configuration et migration

#### Propriété 52 : Phase BUSINESS_PHASE détermine le gateway WhatsApp

*Pour toute* lecture de `business_config.BUSINESS_PHASE`, `WhatsAppGatewayFactory.forPhase()` retourne :
- `BaileysGateway` si `phase = "mvp"` ;
- `WhatsAppBusinessGateway` si `phase ∈ {"freemium","commission"}` et le flag `WAB_VALIDATED = true` est présent.

Toute tentative de transition vers `freemium` sans flag est rejetée.

**Validates: Requirements 37.1, 37.2, 37.4**

#### Propriété 53 : Région désactivée bloque l'inscription

*Pour toute* `users.register` avec `region` correspondant à `business_config.DISABLED_REGIONS`, l'opération échoue avec `REGION_DISABLED` et aucun `users` n'est créé.

**Validates: Requirements 40.5**

### Récapitulatif des propriétés et critères couverts

| Catégorie | Propriétés | Requirements ciblés |
|-----------|-----------|---------------------|
| Round-trip | 1-5 | 12.4, 13.4, 23.2, 23.3, 23.5, 48.3 |
| Validation | 6-11 | 1.3, 4.3, 4.4, 25.5, 27.2, 46.1 |
| Knowledge Graph | 12-18 | 7.3, 17.3, 17.5, 18.2, 18.3, 18.6, 19.1-5, 22.3 |
| Matching | 19-24 | 15.1, 19.4, 20.2-5, 21.1-5, 41.4, 50.1-3 |
| Persona | 25-28 | 11.2-4, 12.1-4, 15.4, 25.1, 25.3, 25.4, 36.1, 36.2 |
| Match flow | 29-35 | 6.4, 7.5, 8.4, 9.1, 24.1-5 |
| Modération | 36-40 | 5.4, 7.4, 9.4-5, 10.1, 30.2, 31.6, 44.3-5 |
| Paiement | 41-47 | 28.3, 28.5, 29.4, 29.5, 31.2-4, 34.1-2, 40.3, 49.1-3 |
| Observabilité | 48-51 | 42.1-2, 42.4-5, 45.2 |
| Configuration | 52-53 | 37.1-4, 40.5 |

Les critères restants (`EXAMPLE`, `EDGE_CASE`, `INTEGRATION`, `SMOKE`) sont couverts dans la section **Stratégie de tests**.

---

## Stratégie de tests

### Approche duale

Conformément aux conventions Aura et au cahier des charges :

- **Tests unitaires (Vitest)** : valident des exemples spécifiques, des edge cases, des configurations et la logique pure (Zod schemas, algos déterministes, persona regex).
- **Tests property-based (fast-check)** : valident les 53 propriétés de la section précédente avec ≥ 100 itérations chacune.
- **Tests d'intégration (Vitest + Postgres test container + mocks Evolution_API/Fapshi)** : valident les flux multi-modules (webhook → agent → orchestrator → notification).
- **Tests e2e (Playwright)** : valident les parcours critiques R47.

### Configuration des tests property-based

```ts
// vitest.config.ts (extrait)
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },        // sérialise pour DB shared
    coverage: { provider: "v8", reporter: ["text","lcov"] },
  },
});

// tests/setup.ts
import * as fc from "fast-check";
fc.configureGlobal({
  numRuns: Number(process.env.PBT_NUM_RUNS ?? "100"),    // ≥ 100 (R47)
  verbose: 1,
  seed: process.env.PBT_SEED ? Number(process.env.PBT_SEED) : undefined,
  reporter: detailedReporter,                             // imprime counterexample structuré
});
```

Chaque test PBT porte un commentaire de tag :

```ts
// tests/graph/round-trip-entity.spec.ts
import * as fc from "fast-check";
import { Entity, parseEntity, serializeEntity } from "@/operations/graph/entity-schemas";
import { entityArbitrary } from "./arbitraries";

// Feature: whatsapp-ai-matchmaking-platform, Property 1: Round-trip de sérialisation des entités
test("round-trip entity preserves equivalence", () => {
  fc.assert(
    fc.property(entityArbitrary(), (e) => {
      const back = parseEntity(serializeEntity(e));
      expect(back).toEqual(e);
    }),
  );
});
```

### Arbitraires (générateurs fast-check)

```ts
// tests/arbitraries/graph.ts
import * as fc from "fast-check";
import { Region, EntityType } from "@/generated/prisma";

export const regionArb = fc.constantFrom("CM","CI","SN","BF","GA","TG","BJ","NE","TD","CG");

export const entityValueArb = fc.string({ minLength: 1, maxLength: 80 })
  .filter(s => s.trim().length > 0);

export const skillEntityArb = fc.record({
  id: cuidArb(),
  type: fc.constant("skill"),
  userId: cuidArb(),
  value: entityValueArb,
  confidence: fc.float({ min: 0, max: 1, noNaN: true }),
  status: fc.constantFrom("active","pending_review","archived"),
  source: fc.constantFrom("conversation","dashboard"),
  createdAt: fc.date().map(d => d.toISOString()),
});

// Discriminated union sur tous les types
export const entityArbitrary = () =>
  fc.oneof(skillEntityArb, serviceEntityArb, locationEntityArb, industryEntityArb, needEntityArb, userEntityArb);

// Graphe random : N entities + relations connectant un sous-ensemble
export const graphArbitrary = (sizeMin = 5, sizeMax = 50) =>
  fc.tuple(
    fc.array(entityArbitrary(), { minLength: sizeMin, maxLength: sizeMax }),
    fc.array(/* relations */, { minLength: 0, maxLength: 200 }),
  );
```

### Mocks et fixtures

| Module | Mock | Implémentation |
|--------|------|----------------|
| Evolution_API | `MockEvolutionServer` (Hono local sur port aléatoire) | enregistre tous les `sendText`, retourne IDs déterministes ; permet de simuler 429/500 |
| Fapshi | `MockFapshiProvider` | retourne `transId` déterministe ; webhook simulé avec HMAC valide |
| Flutterwave | `MockFlutterwaveProvider` | idem |
| OpenAI/Anthropic | `MockLLMProvider` | retourne réponses fixées par `messages → response` (table) ; tokens calculés `len/4` |
| Embeddings | `MockEmbeddingProvider` | retourne vecteur déterministe `hash(text) → float[1536]` |
| Aura broadcast WS | `MockBroadcastServer` (in-process) | capture les events publiés |
| `ctx.scheduler` | `MockScheduler` | enregistre les jobs sans les exécuter ; tests inspectent les jobs enregistrés |

### Tests unitaires (exemples ciblés)

```
tests/unit/
├── graph/
│   ├── entity-schemas.test.ts          ── valide chaque sous-type
│   ├── extraction-payload.test.ts      ── valide les sorties LLM mockées
│   └── alias-generator.test.ts         ── 100 paires, vérifie regex et déterminisme
├── persona/
│   ├── guardrail-fr.test.ts            ── exemples de tutoiement à bloquer
│   ├── guardrail-en.test.ts            ── exemples de slang à bloquer
│   └── pii-detection.test.ts           ── exemples phone/email/adresse
├── payment/
│   ├── fapshi-provider.test.ts         ── vrai SDK avec mocks
│   ├── webhook-signature.test.ts       ── HMAC valid/invalid
│   └── factory.test.ts                 ── region routing
└── whatsapp/
    ├── parse-evolution.test.ts         ── exemples payload Evolution_API
    ├── parse-wab.test.ts               ── exemples payload WAB
    └── idempotency-key.test.ts         ── replay calls
```

### Tests property-based

```
tests/properties/
├── graph/
│   ├── round-trip-entity.spec.ts            (P1)
│   ├── round-trip-relation.spec.ts          (P2)
│   ├── round-trip-export.spec.ts            (P3)
│   ├── confidence-pending.spec.ts           (P12)
│   ├── extraction-dedup.spec.ts             (P13)
│   ├── traversal-bounds.spec.ts             (P15)
│   ├── traversal-scoring.spec.ts            (P16)
│   └── rating-strength.spec.ts              (P17)
├── matching/
│   ├── rrf-formula.spec.ts                  (P19)
│   ├── badge-bonus.spec.ts                  (P20)
│   ├── diversity-mix.spec.ts                (P21)
│   ├── exclusions.spec.ts                   (P22)
│   ├── cardinality.spec.ts                  (P23)
│   └── cache-hit.spec.ts                    (P24)
├── persona/
│   ├── no-violation.spec.ts                 (P25)
│   ├── pii-confined.spec.ts                 (P26)
│   ├── public-output-cloisonnement.spec.ts  (P27)
│   └── language-detection.spec.ts           (P28)
├── flow/
│   ├── match-create-no-conv.spec.ts         (P29)
│   ├── match-accept-creates-conv.spec.ts    (P30)
│   ├── match-refuse-no-conv.spec.ts         (P31)
│   ├── match-expire.spec.ts                 (P32)
│   ├── conversation-closed-readonly.spec.ts (P33)
│   ├── one-rating-per-conv.spec.ts          (P34)
│   └── dispute-snapshot.spec.ts             (P35)
├── moderation/
│   ├── auto-suspension.spec.ts              (P36)
│   ├── matching-quota.spec.ts               (P37)
│   └── service-quota.spec.ts                (P38)
├── payment/
│   ├── idempotency-key.spec.ts              (P41)
│   ├── webhook-idempotent.spec.ts           (P42)
│   ├── region-mapping.spec.ts               (P44)
│   ├── activation-conditioned.spec.ts       (P45)
│   ├── boost-7days.spec.ts                  (P46)
│   └── pro-30days.spec.ts                   (P47)
├── observability/
│   ├── userid-hmac-stable.spec.ts           (P48)
│   ├── correlation-id-propagation.spec.ts   (P49)
│   ├── token-accounting.spec.ts             (P50)
│   └── quality-score.spec.ts                (P51)
├── validation/
│   ├── zod-validation.spec.ts               (P6)
│   ├── profile-bounds.spec.ts               (P7)
│   ├── photo-format.spec.ts                 (P8)
│   ├── chat-message-bound.spec.ts           (P9)
│   └── alias-format.spec.ts                 (P10)
└── round-trip/
    ├── whatsapp-message.spec.ts             (P4)
    └── agent-state-persistence.spec.ts      (P5)
```

### Tests d'intégration

```
tests/integration/
├── webhook-whatsapp-to-agent.test.ts
│   1. POST /webhooks/whatsapp avec HMAC valide
│   2. attendre 2s
│   3. vérifier que agent_states[user_id] a bien évolué
│   4. vérifier que outbox contient un envoi WhatsApp
│
├── agent-orchestrator-flow.test.ts
│   1. injecter inbound message intent matching
│   2. mock LLM extraction → constraints
│   3. mock GraphTraversal+EmbeddingQuery
│   4. vérifier match_sessions persisté
│   5. vérifier reply formatée numérotée 1..5
│
├── webhook-fapshi-activation.test.ts
│   1. créer payment pending
│   2. POST /webhooks/fapshi avec HMAC + status=SUCCESSFUL
│   3. vérifier payments.status=succeeded + boost créé
│   4. replay même webhook → idempotence vérifiée (1 boost seulement)
│
└── chat-realtime.test.ts
    1. ouvrir 2 connexions WS user A et B
    2. user A POST send-message
    3. vérifier B reçoit event message:new < 500ms
    4. fermer B → A POST send → vérifier outbox WhatsApp pour B
```

### Tests e2e (Playwright)

```
tests/e2e/
├── full-onboarding.spec.ts            (R47.1)
│   inscription → liaison WhatsApp → choix prestataire → ajout service →
│   recherche utilisateur → matching → double opt-in → premier message
│
├── badge-verification.spec.ts         (R47.2)
│   achat Badge → upload selfie/CNI → revue Admin → activation → notif
│
├── dispute-flow.spec.ts               (R47.3)
│   signalement → snapshot → revue Admin → avertissement → suspension à 3
│
└── payment-idempotency.spec.ts        (R47.4)
    paiement Fapshi → webhook signé → activation → idempotence webhook répété
```

Tous les e2e tournent contre une base PostgreSQL+pgvector éphémère (testcontainers) et un mock Evolution_API + Fapshi (R47.5).

### Couverture des EXAMPLE / SMOKE / INTEGRATION

| Type | Exemples couverts |
|------|-------------------|
| EXAMPLE | Inscription email/password (R1.1), persistance link code consommé (R2.1 fixture), choix de type profil (R3.1), pas de suppression user des messages (R8.3), system prompt persona (R11.1), injection structurée (R13.2), expose offres en freemium (R31.1), queue admin pending_review (R32.3), politique confidentialité visible (R38.2) |
| SMOKE | Index présents (R17.4), API serializeEntity exportée (R23.1), Aura broadcast utilisé exclusivement (R26.1), POST seul sur webhook Fapshi (R29.1), méthode Provider_Fapshi instanciée (R28.2), interface PaymentProvider 4 méthodes (R28.1), `@aura/auth` importé (R35.1), CSRF actif (R35.2), HTTPS prod (R35.3), interface WhatsAppTransport (R37.3), Dashboard FR/EN (R39.1), build fail clés manquantes (R39.4), health endpoint (R45.1), métriques Prometheus (R45.3), Docker compose (R45.4), backup script (R45.5), conservation 30j whatsapp_inbox (R48.5), LangChain présent (R43.1), config provider env (R43.2), nouveau pays politique (R38.5) |
| INTEGRATION | Latence chat <500ms (R27.1), 200 conv simultanées (R27.3), latence orchestrateur (R41.1-3), délai job <60s (R22.4), tests e2e (R47), métriques de production (R42.2 alertes) |

### Performance tests

Suite séparée déclenchée manuellement (pas en CI) :

```
tests/perf/
├── matching-latency.bench.ts          ── 1000 requêtes Orchestrateur, mesure p50/p95/p99
├── chat-latency.bench.ts              ── 1000 messages, mesure broadcast latency
├── graph-traversal-scale.bench.ts     ── graphes 10k, 100k, 1M entités
└── concurrent-conversations.bench.ts  ── 200 conversations simultanées
```

Outils : `autocannon` pour HTTP, `mitata` pour micro-benchmarks.

---
