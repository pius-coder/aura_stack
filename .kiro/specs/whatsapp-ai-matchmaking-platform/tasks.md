# Plan d'implémentation — WhatsApp AI Matchmaking Platform

> **Lecture** : 14 vagues, 5 à 7 tâches par vague (~88 tâches au total). Les tâches d'une même vague sont **parallélisables** entre elles. Chaque tâche est autonome, livre du code testable et indique les fichiers à toucher + le critère d'acceptation. Après chaque vague : `bun run test` doit rester vert et `bun aura:doctor` doit passer.
>
> **Conventions** : tous les artefacts respectent les suffixes Aura (`.operation.ts`, `.agent.ts`, `.http.ts`, `.cron.ts`, `.workflow.ts`, `.search.ts`, `.vector.ts`, `.middleware.ts`, `.component.ts`) et le kebab-case strict. Chaque ajout passe par `bun run aura:codegen` puis `bun aura:doctor`.
>
> **Décisions ancrées**
> 1. Auth = OTP WhatsApp uniquement (pas d'email, pas de mot de passe).
> 2. Rôles cumulables : un user est *Member* dès la création, devient *Provider* au 1er service publié, *Client* dès la 1re recherche, *Admin* via `AuraUser.isAdmin`.
> 3. Paiements : DB + UI complets, providers stubés, drapeau `PAYMENTS_ENABLED=false`.
> 4. Knowledge Graph v1 = vector search direct sur profil+services concaténés ; entités/relations consignées dès wave 7 mais le scoring hybride RRF est livré en wave 8.
> 5. Persona FR vouvoyée stricte : 1 prompt + 1 post-check regex + 1 seul retry max (anti-boucle coûteuse).
> 6. Voix (auth voix, vocal-to-text) : post-MVP. OTP WhatsApp couvre déjà l'illettré (le bot peut vocaliser le code).

---

## Vague 1 — Fondations base de données

> **Objectif** : schéma Prisma complet de toutes les entités métier. Aucune logique applicative, juste la fondation. Critère vague : `bun run db:push` réussit, seed peuple la base, Prisma Studio montre les rangées.

### T1.1 Étendre `prisma/schema.prisma` avec les modèles métier

- **Fichiers** : `prisma/schema.prisma`
- **Modèles à ajouter** :
  - `Profile` (`userId @id`, `displayName`, `bio?`, `photoFileId?`, `locationLabel?`, `lat?`, `lng?`, `language` enum `FR|EN`, `isProvider` bool, `isClient` bool, `isVerified` bool, `verifiedAt?`, `warningCount`, `status` enum `ACTIVE|SUSPENDED`, `alias` unique, `consent` Json, timestamps)
  - `Service` (`id`, `userId`, `title`, `description`, `priceXaf` int, `availability` enum, `zone`, `isActive`, timestamps, `@@index([userId, isActive])`)
  - `Match` (`id`, `requesterId`, `targetId`, `status` enum `PENDING|ACCEPTED|REFUSED|CANCELLED`, `originSessionId?`, timestamps, `@@unique([requesterId, targetId, status])`)
  - `Conversation` (`id`, `userAId`, `userBId`, `matchId` unique, `status` enum `OPEN|CLOSED|DISPUTED`, timestamps, `@@index([userAId])`, `@@index([userBId])`)
  - `ChatMessage` (`id`, `conversationId`, `senderId`, `body`, `readBy` Json, timestamps, `@@index([conversationId, createdAt])`)
  - `Rating` (`id`, `conversationId`, `raterId`, `rateeId`, `score` 1..5, `comment?`, `createdAt`, `@@unique([conversationId, raterId])`)
  - `Dispute` (`id`, `conversationId`, `reporterId`, `reason`, `snapshot` Json, `status` enum `OPEN|UNDER_REVIEW|RESOLVED|DISMISSED`, `resolution?`, `resolvedById?`, timestamps)
  - `KnowledgeEntity` (`id`, `userId`, `type` enum `SKILL|LOCATION|INDUSTRY|NEED|SERVICE|USER`, `value`, `confidence` float, `metadata` Json, `embeddingId?`, timestamps, `@@index([userId, type])`)
  - `KnowledgeRelation` (`id`, `sourceId`, `targetId`, `predicate` enum `PROVIDES|REQUIRES|LOCATED_IN|LOOKS_FOR|MATCHES|CONNECTED_TO|RATED`, `strength` float, timestamps)
  - `GraphEmbedding` (`id`, `entityId` unique, `embedding` `Unsupported("vector(1536)")`, `metadata` Json, `updatedAt`)
  - `WhatsappInbox` (`id`, `providerMessageId` unique, `phoneE164`, `direction` enum `IN|OUT`, `payload` Json, `processedAt?`, `error?`, `createdAt`)
  - `WhatsappOutbox` (`id`, `idempotencyKey` unique, `phoneE164`, `body`, `status`, `attempts`, `nextRunAt`, `lockedAt?`, `error?`, timestamps)
  - `MatchSession` (`id`, `requesterId`, `query`, `intent`, `candidatesGraph` Json, `candidatesVector` Json, `fusedTopN` Json, `pickedId?`, `latencyMs`, `createdAt`)
  - `Payment` (`id`, `userId`, `provider`, `providerTransId?` unique, `kind` enum `BADGE|BOOST|PRO|COMMISSION`, `amountXaf`, `status` enum `PENDING|SUCCEEDED|FAILED|REFUNDED`, `metadata` Json, timestamps)
  - `Subscription` (`id`, `userId`, `plan` enum `BASIC|PRO`, `startsAt`, `endsAt`, `status` enum `ACTIVE|EXPIRED|CANCELLED`, `paymentId?`)
  - `BoostSlot` (`id`, `userId`, `startsAt`, `endsAt`, `paymentId?`, `status`)
- **AC** : `bun run db:push` succès ; `bun aura:doctor` ne se plaint d'aucun nouveau modèle.

### T1.2 Migration + extension pgvector

- **Fichier** : `prisma/migrations/<ts>_add_pgvector/migration.sql`
- Ajouter `CREATE EXTENSION IF NOT EXISTS vector;` puis `ALTER TABLE "GraphEmbedding" ADD COLUMN "embedding" vector(1536);` et `CREATE INDEX "GraphEmbedding_embedding_idx" ON "GraphEmbedding" USING hnsw ("embedding" vector_cosine_ops);`
- **AC** : `bun run db:deploy` joue la migration sans erreur. `SELECT * FROM pg_extension WHERE extname='vector';` retourne 1 ligne.

### T1.3 Seed script `scripts/seed.ts`

- **Fichiers** : `scripts/seed.ts`, `package.json` (ajouter `"db:seed": "bun scripts/seed.ts"`)
- Créer : 1 admin (`isAdmin=true`, phone `+237600000000`), 20 prestataires variés (artisans, freelances, professionnels) avec 1 à 3 services chacun, 30 clients, 5 matchs en cours.
- Données réalistes Cameroun : Yaoundé, Douala, Bafoussam, MTN/Orange.
- **AC** : `bun run db:seed` peuple la base sans erreur ; `prisma studio` montre les rangées.

### T1.4 `_registry.ts` régénéré + alias générés

- **Fichiers** : `src/operations/_registry.ts`, `src/aura/_generated/api.ts`
- Lancer `bun run aura:codegen` après chaque vague.
- **AC** : `bun aura:doctor` vert.

### T1.5 Feature flags `src/lib/feature-flags.ts`

- **Fichiers** : `src/lib/feature-flags.ts`, `.env`
- Exporter `featureFlags = { paymentsEnabled: process.env.PAYMENTS_ENABLED === "true", voiceAuthEnabled: false, knowledgeGraphHybridEnabled: false }` ; ajouter `PAYMENTS_ENABLED=false` au `.env.example`.
- **AC** : import depuis n'importe quel fichier server donne les bonnes valeurs.

### T1.6 Storage `uploads/` + `.gitignore`

- **Fichiers** : `.gitignore`, `uploads/.gitkeep`, `.env`
- Créer le dossier, l'ajouter au gitignore (sauf `.gitkeep`), s'assurer que `AURA_STORAGE_PATH=./uploads` est défini.
- **AC** : `ctx.storage.store(file)` écrit dans `./uploads` en dev sans erreur.

---

## Vague 2 — Authentification OTP WhatsApp

> **Objectif** : un visiteur entre son numéro, reçoit un code via WhatsApp, le saisit, est connecté. Une seule étape qui sert à la fois d'auth et de liaison WhatsApp.

### T2.1 Gateway WhatsApp `src/lib/whatsapp/gateway.ts`

- **Fichiers** : `src/lib/whatsapp/gateway.ts`, `src/lib/whatsapp/evo-api-gateway.ts`, `src/lib/whatsapp/factory.ts`
- Interface `WhatsAppGateway`: `sendText(to, body, idempotencyKey)`, `getInstanceState()`, `setWebhook(url, events)`.
- Implémentation `EvoApiGateway` : `POST {EVOLUTION_API_BASE_URL}/message/sendText/{instance}` header `apikey`, body `{number, text}`. Idempotence côté client (dédup en mémoire 5 min sur `idempotencyKey`). Retry 3x avec backoff (1s, 2s, 4s) sur erreur réseau.
- Factory : lit `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_INSTANCE_ID`, `EVOLUTION_API_KEY`. Instancie un singleton.
- **Tests** : mock fetch, vérifier headers, body, idempotency.
- **AC** : `whatsAppGateway().sendText("+237657526695", "test", "key1")` envoie un message vrai en dev.

### T2.2 Channel WhatsApp pour `ctx.notify` `src/operations/_channels/whatsapp.channel.ts`

- **Fichiers** : `src/aura/server/notifications.ts` (extension), `src/operations/_channels/whatsapp.channel.ts`
- Brancher la sortie « whatsapp » du dispatcher pour appeler `whatsAppGateway().sendText`. Persister dans `WhatsappOutbox` puis confirmer succès/échec.
- **AC** : `await ctx.notify.via("whatsapp").send({ to: phoneE164, body })` envoie un WhatsApp réel et trace une ligne `WhatsappOutbox.SUCCEEDED`.

### T2.3 Operation `auth.start-phone-otp`

- **Fichier** : `src/operations/auth/start-phone-otp.operation.ts`
- `.mutate().input(z.object({ phoneE164: phoneSchema })).public()`
- Rate-limit DB-backed `enforceRateLimit({ key: "otp:request:"+phone, limit: 3, windowSeconds: 900 })`.
- Appel `sendOtp(ctx.db, input.phoneE164, "LOGIN_PHONE")` qui retourne `{ codeHash, expiresAt }`. Le code clair est généré par `sendOtp` et retourné via un override : étendre `sendOtp` pour exposer le code clair localement (mais ne jamais le journaliser). Récupérer le code clair, l'envoyer via `ctx.notify.via("whatsapp")` au numéro avec template `"Votre code Vibe : 123456 — valable 5 min. Ne le partagez jamais."`.
- **AC** : un appel renvoie `{ ok: true }` et un message WhatsApp arrive sur le numéro testé. Un 4e appel dans la fenêtre lève `RATE_LIMITED`.

### T2.4 Operation `auth.verify-phone-otp`

- **Fichier** : `src/operations/auth/verify-phone-otp.operation.ts`
- `.mutate().input(z.object({ phoneE164: phoneSchema, code: z.string().length(6) })).public()`
- Appel `verifyOtp(ctx.db, input.phoneE164, input.code)` → retourne `user`. Si premier login : créer `AuraPhoneIdentity` (verifiedAt + whatsappVerifiedAt = now) et `Profile` minimal (alias auto, language=fr).
- Crée la session via `createSession`, set cookie via `ctx.auth.setSessionCookie`.
- Retourne `{ userId, isNewUser, hasProfile }`.
- **AC** : code valide → session ouverte ; code invalide → 5 tentatives max ; après expiration → erreur claire.

### T2.5 Operations `auth.me` et `auth.logout`

- **Fichiers** : `src/operations/auth/me.operation.ts`, `src/operations/auth/logout.operation.ts`
- `auth.me`: `.query().auth()` retourne `{ user, profile, isProvider, isClient, isAdmin }`.
- `auth.logout`: `.mutate().auth()` appelle `revokeCurrentSession`.
- **AC** : `useAuraQuery(api.auth.me)` côté client retourne le user connecté ; `auth.logout` clear le cookie.

### T2.6 Génération d'alias `src/lib/alias.ts`

- **Fichier** : `src/lib/alias.ts`
- Fonction `generateAlias()` qui combine animal+adjectif+nombre 4 chiffres (ex: `lion-rapide-4521`). Liste de 100 animaux + 100 adjectifs en français. Uniqueness check contre `Profile.alias`.
- **AC** : 1000 appels successifs → 0 collision (vérification statistique dans test).

### T2.7 Middleware `with-profile.middleware.ts`

- **Fichier** : `src/operations/_middleware/with-profile.middleware.ts`
- Charge le `Profile` depuis `ctx.user.id` et l'attache au contexte. Lève `BAD_REQUEST` si `Profile.status === "SUSPENDED"`.
- **AC** : appliqué sur `services.create`, un user suspendu reçoit erreur explicite.

---

## Vague 3 — Landing futuriste + Auth UI

> **Objectif** : pages publiques `/`, `/sign-in`, `/sign-up`, `/demo`, `/legal/*` avec un design *luminous* inspiré du langage Gemini (gradient mesh animé bleu→rouge→jaune→vert, motion springy, dark mode default, typographie Inter Variable).

### T3.1 Tokens de thème `src/styles.css`

- **Fichier** : `src/styles.css`
- Ajouter custom properties : `--gradient-luminous` (radial-gradient bleu/rouge/jaune/vert), `--surface-elevated`, `--blur-glass`, `--shadow-glow`. Configurer dark mode default (`html { color-scheme: dark; }`). Ajouter keyframes `gradient-shift` (durée 20s, infinie, easing cubic-bezier).
- **AC** : `<div class="bg-gradient-luminous">` rend un mesh animé fluide.

### T3.2 Composant `src/aura/ui/luminous-hero.tsx`

- **Fichier** : `src/aura/ui/luminous-hero.tsx`
- Composant réutilisable avec mesh gradient animé en background absolu, glow blur 80px, logo Vibe centré, slot pour titre + sous-titre + CTA. Respecte `prefers-reduced-motion`.
- **AC** : storybook-like dans `/` rend un hero plein écran.

### T3.3 Route `src/app/routes/index.tsx` (landing)

- **Fichier** : `src/app/routes/index.tsx`
- Sections : Hero (luminous, headline « Votre prestataire de confiance, en moins de 3 minutes »), 3 étapes (téléphone → OTP WhatsApp → conversation IA), témoignages anonymisés mockés, exemples de prestataires (carousel `embla`), CTA `/sign-up`, footer.
- Aucune donnée serveur requise (page statique pour SEO).
- **AC** : page rendue côté serveur ; Lighthouse >85 perf et >95 accessibilité.

### T3.4 Routes `/sign-in` et `/sign-up`

- **Fichiers** : `src/app/routes/sign-in.tsx`, `src/app/routes/sign-up.tsx`
- 2 étapes : (1) saisir numéro avec `libphonenumber-js` validation FR+CMR, (2) saisir OTP 6 chiffres via `<InputOTP>`.
- Utilisent `useAuraMutation(api.auth.start-phone-otp)` puis `api.auth.verify-phone-otp`.
- Redirection après succès : `/onboarding` si nouveau user, `/app` sinon.
- **AC** : un visiteur s'inscrit avec un numéro CMR, reçoit le code WhatsApp, est connecté.

### T3.5 Route démo publique `src/app/routes/demo.tsx`

- **Fichier** : `src/app/routes/demo.tsx`
- Chat sandboxé avec un agent `ai.demo-bot` (un seul thread partagé, rate-limit 10 messages/IP/heure, persona dégradée sans accès DB). Sert de preuve de qualité.
- **AC** : un visiteur peut taper `je cherche un plombier à Yaoundé` et recevoir une réponse cohérente sans s'inscrire.

### T3.6 Layout public `src/aura/ui/public-layout.tsx`

- **Fichier** : `src/aura/ui/public-layout.tsx`
- Header sticky avec logo Vibe (gradient G), nav `Comment ça marche / Démo / Connexion / S'inscrire`, footer 4 colonnes (Produit / Légal / Société / Contact). Locale toggle FR/EN (UI seulement, EN fallback FR pour le MVP).
- **AC** : appliqué sur `/`, `/sign-in`, `/sign-up`, `/demo`, `/legal/*`.

---

## Vague 4 — Profil + Onboarding

> **Objectif** : après auth, un user complète son profil en 3 étapes (identité, langue, consentements) puis atterrit sur le dashboard `/app`.

### T4.1 Operations profil `profiles.{get,update,update-photo,set-language}`

- **Fichiers** : `src/operations/profiles/get.operation.ts`, `update.operation.ts`, `update-photo.operation.ts`, `set-language.operation.ts`
- `get`: `.query().auth()` retourne `Profile` enrichi avec `Service.count` et `Rating.avg`.
- `update`: `.mutate().input(z.object({ displayName, bio?, locationLabel?, lat?, lng? })).entities(["Profile"])` — bio max 1000 chars, displayName max 80.
- `update-photo`: `.action()` accepte `File`, valide `image/png|jpeg|webp` ≤ 5 Mo, persiste via `ctx.storage.store` puis met à jour `Profile.photoFileId`.
- `set-language`: change `Profile.language`, déclenche scheduler `embeddings.regenerate` (vague 8).
- **AC** : update profil → entity invalidate → tout `useAuraQuery(api.profiles.get)` se rafraîchit.

### T4.2 Operation `profiles.set-consent`

- **Fichier** : `src/operations/profiles/set-consent.operation.ts`
- `.mutate().input(z.object({ privacy: z.boolean(), dataProcessing: z.boolean(), whatsappComms: z.boolean() })).auth()`
- Persiste `Profile.consent = { privacy: now, dataProcessing: now, whatsappComms: now }` après vérification que les 3 sont `true`. Audit log obligatoire.
- **AC** : sans consentement, l'agent WhatsApp refuse de servir l'utilisateur (vérifié via guard sur l'agent en wave 7).

### T4.3 Wizard onboarding `src/app/routes/onboarding.tsx`

- **Fichier** : `src/app/routes/onboarding.tsx`
- 3 étapes via `useAuraStepper` : (1) nom + photo + bio + ville, (2) langue préférée, (3) consentements RGPD/CEMAC + alias visible.
- Composant `<AuraForm>` par étape, validation Zod stricte.
- À la fin : redirection `/app`.
- **AC** : nouveau user passe les 3 étapes, atterrit sur `/app`, profil complet en DB.

### T4.4 Route `src/app/routes/app/_layout.tsx` (shell membre)

- **Fichier** : `src/app/routes/app/_layout.tsx`, `src/app/routes/app/index.tsx`
- `<AuraDashboardShell>` avec sidebar : Accueil, Mes services (visible si `isProvider`), Mes recherches, Conversations, Notes, Paramètres, Abonnement.
- `<AuraGuardView redirectTo="/sign-in">`. Bloque si `Profile.status === "SUSPENDED"` (page dédiée `/suspended`).
- Page accueil : KPIs perso (matchs en cours, messages non lus, derniers matchs), chips d'actions rapides.
- **AC** : `/app` accessible uniquement aux users connectés non suspendus.

### T4.5 Composant `<ConsentBanner>` `src/aura/ui/consent-banner.tsx`

- **Fichier** : `src/aura/ui/consent-banner.tsx`
- Banner sticky bas si `Profile.consent` incomplet → renvoie sur `/onboarding/consent`.
- **AC** : un user dont les consentements sont obsolètes voit la banner et peut renouveler.

### T4.6 Route paramètres `src/app/routes/app/settings.tsx`

- **Fichier** : `src/app/routes/app/settings.tsx`
- `<AuraSettingsLayout>` avec sous-pages : Profil, Langue, Sécurité (sessions actives + déconnexion globale), Confidentialité (export données + suppression compte demandée), Préférences notifications.
- **AC** : un user peut changer son nom, sa photo et sa langue depuis l'app.

---

## Vague 5 — Services prestataire (CRUD + bascule auto)

> **Objectif** : un membre publie un service, devient automatiquement *Provider*, le service est immédiatement vectorisé pour matching.

### T5.1 Operations lecture `services.{list-mine,get,list-public}`

- **Fichiers** : `src/operations/services/list-mine.operation.ts`, `get.operation.ts`, `list-public.operation.ts`
- `list-mine`: `.query().auth().entities(["Service"])` retourne services de `ctx.user.id` paginés via `ctx.paginate`.
- `get`: par id, public, joint au profil prestataire (sans données privées).
- `list-public`: paginé, filtre `zone`, `priceMin`, `priceMax`, recherche full-text (vague 8).
- **AC** : list-mine d'un user sans service retourne `[]` ; après création, refetch automatique grâce à entity invalidation.

### T5.2 Operations écriture `services.{create,update,toggle,delete}`

- **Fichiers** : `src/operations/services/create.operation.ts`, `update.operation.ts`, `toggle.operation.ts`, `delete.operation.ts`
- `create`: `.mutate().input(z.object({ title: max 120, description: max 2000, priceXaf: int positif, availability: enum, zone: max 80 })).entities(["Service","Profile"]).auth()`. Limite : 50 services actifs sans Pro, sinon erreur.
- `toggle` : flip `isActive`. `delete` : soft delete (`deletedAt`).
- Tous appellent en post-handler `ctx.scheduler.runAfter(0, api.embeddings.regenerate, { userId: ctx.user.id })` (wave 8).
- **AC** : créer 51 services sans Pro → erreur ; supprimer un service → liste rafraîchie.

### T5.3 Auto-bascule `Profile.isProvider`

- **Fichier** : `src/operations/services/create.operation.ts` (modification de la handler)
- Si `Profile.isProvider === false` à la création du 1er service, set `isProvider = true`.
- Audit `profiles.became-provider`.
- **AC** : créer le 1er service active automatiquement le rôle Provider sans étape supplémentaire.

### T5.4 Route `src/app/routes/app/services/index.tsx` + wizard create

- **Fichiers** : `src/app/routes/app/services/index.tsx`, `src/app/routes/app/services/new.tsx`, `src/app/routes/app/services/$id.tsx`
- Liste : `<AuraDataTable query={api.services.list-mine} columns=[...]>` avec actions toggle + edit + delete.
- Form de création : `<AuraForm>` avec champs validation.
- **AC** : un user crée son service depuis l'UI ; il devient Provider et le service apparaît dans la liste.

### T5.5 Page publique prestataire `src/app/routes/p/$alias.tsx`

- **Fichier** : `src/app/routes/p/$alias.tsx`
- Charge `profiles.get-by-alias` (lecture publique, photos masquées si pas de match accepté), liste des services actifs, note moyenne.
- **AC** : URL `/p/lion-rapide-4521` rend la page publique du prestataire correspondant.

### T5.6 Operation `profiles.get-by-alias`

- **Fichier** : `src/operations/profiles/get-by-alias.operation.ts`
- `.query().input(z.object({ alias: z.string() })).public().entities(["Profile"])`
- Retourne champs publics uniquement : `displayName masqué (alias)`, `bio`, `locationLabel`, `language`, `isVerified`, `services`. **Ne révèle jamais** `phoneE164`, `lat`, `lng`, `email`, photo réelle (placeholder gradient avant match).
- **AC** : test snapshot vérifie qu'aucun champ sensible ne fuit.

---

## Vague 6 — Transport WhatsApp (webhook + outbox + admin live)

> **Objectif** : Aura reçoit chaque message WhatsApp entrant en live, le persiste, le route vers le bon user. Inversement, peut envoyer des messages avec idempotence.

### T6.1 HTTP action webhook `src/operations/webhooks/whatsapp.http.ts`

- **Fichier** : `src/operations/webhooks/whatsapp.http.ts`
- `defineHttpAction("/webhooks/whatsapp", "POST").public().csrf(false).handler(...)`.
- Vérifier `secret` query param == `WHATSAPP_WEBHOOK_SECRET` (env), sinon 401.
- Parser le payload Evolution API, persister dans `WhatsappInbox` (idempotent par `key.id` du payload).
- Enqueue scheduler `agent.process-incoming` avec `whatsappInboxId`.
- ACK 200 sous 200 ms (rien de bloquant dans le handler).
- **AC** : envoyer un message WhatsApp au numéro test → ligne créée dans `WhatsappInbox` < 1 s.

### T6.2 Configuration auto du webhook Evolution API

- **Fichier** : `scripts/configure-evo-webhook.ts`, `package.json` (`"evo:configure-webhook"`)
- Script qui POST `{EVOLUTION_API_BASE_URL}/webhook/set/{instance}` avec `{webhook:{enabled:true,url:"${PUBLIC_APP_URL}/aura-http/webhooks/whatsapp?secret=${WHATSAPP_WEBHOOK_SECRET}",events:["MESSAGES_UPSERT","CONNECTION_UPDATE"],webhook_by_events:false,webhook_base64:false}}`.
- **AC** : `bun run evo:configure-webhook` configure correctement et `GET /webhook/find/test` confirme.

### T6.3 Resolver `phoneE164 → userId`

- **Fichier** : `src/lib/whatsapp/resolve-user.ts`
- Fonction `resolveUserByPhone(db, phoneE164)` : cherche `AuraPhoneIdentity.phoneE164`, retourne `userId | null`.
- Si null, déclenche réponse onboarding (« Bienvenue. Pour utiliser Vibe, inscrivez-vous sur https://... »).
- **AC** : message d'un numéro non lié → réponse onboarding ; message d'un numéro lié → routé vers l'agent du user.

### T6.4 Operation `agent.process-incoming` (action)

- **Fichier** : `src/operations/agent/process-incoming.operation.ts`
- `.action().input(z.object({ whatsappInboxId: z.string() })).internal()`
- Charge `WhatsappInbox` row, résout user, invoque l'agent (vague 7) avec le message.
- Marque `WhatsappInbox.processedAt = now()` à la fin.
- **AC** : invoqué via scheduler, traite un message en < 5 s p95.

### T6.5 Outbox WhatsApp + cron retry

- **Fichiers** : `src/operations/whatsapp/process-outbox.cron.ts`
- `defineCronFn("whatsapp.process-outbox").schedule("*/30 * * * * *")` (toutes les 30 s, expression à 6 champs supportée par le runner) ou `*/1 * * * *` selon le runner.
- Pioche `WhatsappOutbox` PENDING dont `nextRunAt <= now()`, lock + envoie via `whatsAppGateway`. Backoff exponentiel, max 6 tentatives.
- Diffuse une invalidation entity `["WhatsappOutbox"]` après chaque batch.
- **AC** : un message en échec ré-essaye automatiquement avec backoff visible dans la table.

### T6.6 Page admin live `/admin/whatsapp/flow`

- **Fichier** : `src/app/routes/admin/whatsapp/flow.tsx`
- 2 colonnes : Inbox live (derniers 50 messages entrants, abonnement WS room `admin:whatsapp-flow`), Outbox live (derniers 50 sortants).
- Filtre par phone, par direction, par statut. Lien vers `/admin/users/:id/agent` pour drill-in.
- **AC** : un admin voit les messages arriver en temps réel ; latence < 1 s.

### T6.7 Test d'intégration end-to-end webhook

- **Fichier** : `src/operations/webhooks/whatsapp.http.test.ts`
- Mock Evolution API payload, POST sur le handler, vérifier : ligne `WhatsappInbox` créée, idempotence (2e POST ne duplique pas), schedule créé, ACK 200.
- **AC** : `bun run test` passe sur ce fichier.

---

## Vague 7 — Agent LangGraph par utilisateur

> **Objectif** : un agent par user (thread = userId), persona FR vouvoyée stricte, hydratation profil/services, classification d'intention, extraction d'entités.

### T7.1 Schéma d'état + checkpointer

- **Fichiers** : `src/operations/agent/state.ts`, `src/lib/langgraph/postgres-saver.ts`
- Définir `AgentStateSchema` Zod : `{ userId, profile, services, language, conversationHistory, lastIntent, extractedEntities, matchResults, lastUserMessage, lastBotResponse }`.
- Wrapper sur `AsyncPostgresSaver` LangGraph avec `thread_id = userId`. Stocker dans `AuraAgentThread` (pré-existant) + `AuraAgentMessage`.
- **AC** : un thread persiste son état entre 2 messages WhatsApp séparés de 30 s ; redémarrage du process ne perd pas l'état.

### T7.2 Agent racine `src/operations/agents/whatsapp-bot.agent.ts`

- **Fichier** : `src/operations/agents/whatsapp-bot.agent.ts`
- `defineAgent("agents.whatsapp-bot", { model: ChatOpenRouter("anthropic/claude-3.5-sonnet"), systemPrompt: <persona FR vouvoyée stricte>, maxSteps: 6, tools: [searchProvidersTool, getProfileTool] })`.
- System prompt en FR uniquement, vouvoiement obligatoire, ton neutre, refus politique/médical/juridique, redirection vers les fonctionnalités plateforme.
- Outputs structured via Zod : `{ reply: string, intent: enum, extractedEntities: [...] }`.
- **AC** : un appel direct à `ctx.agent.generateText` retourne une réponse FR vouvoyée à 20/20 sur un golden set.

### T7.3 HydrationNode + ResponseNode (LangGraph)

- **Fichiers** : `src/operations/agent/nodes/hydration.ts`, `src/operations/agent/nodes/response.ts`
- `HydrationNode` charge `Profile` + `Service[]` actifs depuis DB et injecte dans state. Refuse si profil suspendu.
- `ResponseNode` envoie via `whatsAppGateway.sendText(phone, reply, idempotencyKey=messageId)` avec post-check regex tutoiement (`/\b(tu|toi|ton|ta|tes)\b/i`). Si match → 1 retry du LLM avec hint « Vous tutoyez, recommencez en vous adressant au vous formel. » ; après 2e échec, fallback prédéfini.
- **AC** : un message tutoyé est régénéré automatiquement ; si 2 échecs, fallback est envoyé.

### T7.4 ExtractionNode

- **Fichier** : `src/operations/agent/nodes/extraction.ts`
- LLM avec structured output Zod : `{ skills: string[], locations: string[], industries: string[], needs: string[], confidence: 0..1 }`.
- Persiste dans `KnowledgeEntity` (dédup par `(userId, type, value)`) + `KnowledgeRelation` (`USER -PROVIDES-> SKILL`, `USER -LOOKS_FOR-> NEED`, etc.).
- Enqueue scheduler `embeddings.regenerate` pour le user.
- **AC** : un message « je suis plombier à Yaoundé spécialisé en chauffe-eau » crée 3 entités (`SKILL=plombier`, `LOCATION=Yaoundé`, `SKILL=chauffe-eau`) avec relations.

### T7.5 MatchingIntentNode

- **Fichier** : `src/operations/agent/nodes/matching-intent.ts`
- LLM classifie : `chat | search_provider | search_connection | account | help`. Confidence ≥ 0.7 pour brancher matching, sinon question clarification.
- Si `search_*`, extrait contraintes `{ skills?, location?, industry?, need?, budgetMaxXaf? }` puis appelle `OrchestratorCallNode` (vague 8).
- **AC** : « je cherche un plombier » → intent search_provider, confidence > 0.9.

### T7.6 Graph compilation `src/operations/agent/graph.ts`

- **Fichier** : `src/operations/agent/graph.ts`
- Assemble : `START → HydrationNode → ConversationNode → MatchingIntentNode → (OrchestratorCallNode | passthrough) → ResponseNode → ExtractionNode (parallel) → END`.
- Compile avec `AsyncPostgresSaver` + `interrupt_before=[]`.
- **AC** : invocation complète d'un tour < 4 s p95 sur message simple.

### T7.7 Branchement `process-incoming` → graph

- **Fichier** : `src/operations/agent/process-incoming.operation.ts` (modification)
- Charge le graph compilé, invoque `graph.invoke({ userId, lastUserMessage }, { configurable: { thread_id: userId } })`.
- En cas d'erreur LLM, fallback persona « Je rencontre une difficulté technique, veuillez réessayer dans un instant. »
- **AC** : un user envoie 5 messages successifs, l'agent répond persona-conforme aux 5 ; messages persistés dans `AuraAgentMessage`.

---

## Vague 8 — Vector matching + Orchestrateur v1

> **Objectif** : matching opérationnel basé sur similarité vectorielle pure (pas encore de RRF/Graph traversal). Calibrable, observable, testable.

### T8.1 Vector index `src/operations/embeddings/profile.vector.ts`

- **Fichier** : `src/operations/embeddings/profile.vector.ts`
- `defineVectorIndex("GraphEmbedding", { vectorField: "embedding", dimensions: 1536, filterFields: ["userId", "entityType"], indexType: "hnsw" })`.
- Migration SQL générée et appliquée.
- **AC** : `vectorSearch` répond < 200 ms sur 1000 lignes seed.

### T8.2 Operation `embeddings.regenerate`

- **Fichier** : `src/operations/embeddings/regenerate.operation.ts`
- `.action().input(z.object({ userId: z.string() })).internal()`
- Concatène `Profile.bio + Profile.skills + Service[].title + Service[].description`. Génère embedding via `OpenAIEmbeddings({ model: "text-embedding-3-small" })`. Upsert dans `GraphEmbedding` avec `metadata = { userId, entityType: "USER_AGGREGATE" }`.
- Idempotent via `(userId, entityType="USER_AGGREGATE")`.
- **AC** : appelé après modif profil/service, l'embedding est mis à jour < 1 s p95.

### T8.3 Orchestrator action `matching.run`

- **Fichier** : `src/operations/matching/run.operation.ts`
- `.action().input(z.object({ requesterId, query, constraints, topK?: int default 5 })).internal()`
- Étapes : (1) embed la query, (2) `vectorSearch` filtré sur `userId != requesterId AND status=ACTIVE`, top 50, (3) Diversity_Mix v1 : 60% top-score, 30% mid (rang 10-25), 10% wildcard random, (4) filtre matchs récents < 30j, (5) log dans `MatchSession`.
- Retourne `{ matchSessionId, profiles: [{ userId, alias, displayName masqué, scoreNormalized, reason }] }`.
- **AC** : sur seed, query « plombier Yaoundé » retourne 5 prestataires plomberie pertinents.

### T8.4 OrchestratorCallNode dans le graph

- **Fichier** : `src/operations/agent/nodes/orchestrator-call.ts`
- Appelle `ctx.runAction(api.matching.run, ...)`. Format la réponse en liste numérotée pour WhatsApp (max 5 profils, chacun avec alias + résumé + raison du match).
- **AC** : un user demande « cherche moi un graphiste à Douala », reçoit une liste WhatsApp formatée avec 3 à 5 profils.

### T8.5 Cron `matching.refresh-stale-embeddings`

- **Fichier** : `src/operations/matching/refresh-stale-embeddings.cron.ts`
- Schedule `0 3 * * *` (3h du matin chaque jour). Pioche `Profile` dont `updatedAt > GraphEmbedding.updatedAt`, enqueue regenerate.
- **AC** : un profil modifié à 14h voit son embedding rafraîchi à 3h le lendemain.

### T8.6 Page admin `/admin/match-sessions/:id`

- **Fichier** : `src/app/routes/admin/match-sessions/$id.tsx`
- Affiche la session : query brute, candidats vector (top 50), top-5 retenus après diversity, choix de l'utilisateur si suivi. Visualisation des scores.
- **AC** : admin clique sur une session, voit tout le pipeline qui l'a produite.

---

## Vague 9 — Match Request + double opt-in

> **Objectif** : un user choisit un profil, envoie une demande, l'autre accepte/refuse, conversation s'ouvre.

### T9.1 Operations match `matches.{create,list-incoming,list-outgoing,accept,refuse,cancel}`

- **Fichiers** : `src/operations/matches/*.operation.ts`
- `create`: `.mutate().input({ targetUserId, originSessionId? }).entities(["Match"]).auth()`. Refus si `Match` existe déjà PENDING/ACCEPTED entre les 2.
- `accept` : passe `Match.status=ACCEPTED`, crée `Conversation` avec `userAId<userBId` ordering, appelle `ctx.notify.via("whatsapp")` au requester avec « Bonne nouvelle, [alias] a accepté votre mise en relation. Ouvrez votre tableau de bord pour démarrer la conversation : ${appUrl}/app/chat/${conversationId}. »
- `refuse` : passe `REFUSED`, notification WhatsApp neutre au requester.
- `cancel` : par le requester si encore `PENDING`.
- **AC** : flow complet A→B accept teste-able en intégration.

### T9.2 Listing matchs avec photos masquées

- **Fichier** : `src/operations/matches/list-incoming.operation.ts`
- Retourne pour chaque match : alias de l'autre, sa bio (sans photo), services proposés (résumé), score original, date.
- Photo réelle uniquement après `ACCEPTED`.
- **AC** : un user voit ses matchs PENDING avec placeholder photo gradient ; après accept, vraie photo apparaît.

### T9.3 Route membre `/app/matches`

- **Fichier** : `src/app/routes/app/matches.tsx`
- 2 onglets : Reçus / Envoyés. Card par match avec actions Accept/Refuse/Cancel.
- **AC** : interaction complète UI.

### T9.4 Notification WhatsApp template

- **Fichier** : `src/lib/whatsapp/templates.ts`
- Templates FR/EN : `MATCH_ACCEPTED`, `MATCH_REFUSED`, `MATCH_NEW_REQUEST`, `CHAT_NEW_MESSAGE`, `OTP_LOGIN`.
- **AC** : changements de wording centralisés dans un seul fichier.

### T9.5 Audit log toutes décisions match

- **Fichier** : modification de chaque opération match
- `ctx.audit.record("matches.accepted", { matchId, requesterId, targetId })`. Pareil pour refuse/cancel.
- **AC** : `/admin/audit` montre la trace complète de chaque décision.

### T9.6 Test end-to-end double opt-in

- **Fichier** : `src/operations/matches/_e2e.test.ts`
- A crée match → B le voit → B accept → conversation créée → A reçoit notification WhatsApp (mock) → photos révélées des 2 côtés.
- **AC** : `bun run test` passe.

---

## Vague 10 — Chat anonyme broadcast WS + relais WhatsApp

> **Objectif** : chat web temps réel pour les paires matchées. WhatsApp utilisé uniquement comme notification si user offline.

### T10.1 Operations chat `chat.{list-conversations,list-messages,send-message,mark-read}`

- **Fichiers** : `src/operations/chat/*.operation.ts`
- `send-message`: `.mutate().input({ conversationId, body: max 4000 }).entities(["ChatMessage","Conversation"]).auth()`. Vérifie que `ctx.user.id` est `userAId` ou `userBId`. Persist message. Diffuse sur room `conversation:{id}` via broadcast.
- `list-messages` : paginé via `ctx.paginate`, 20/page, ordre desc.
- **AC** : 2 onglets ouverts sur la même conversation reçoivent le message en < 200 ms.

### T10.2 Détection présence et relais WhatsApp

- **Fichier** : `src/lib/presence.ts`, `src/operations/chat/send-message.operation.ts` (modif)
- Si destinataire absent du room WS pendant > 60 s → enqueue WhatsApp notification agrégée (1 seul message par conversation par fenêtre 60 s).
- Lock anti-double-notification via `WhatsappOutbox.idempotencyKey = "chat-notif-{convId}-{minute}"`.
- **AC** : un user offline reçoit 1 seule notif par minute par conversation, peu importe le nombre de messages.

### T10.3 Route membre `/app/chat` + `/app/chat/$id`

- **Fichiers** : `src/app/routes/app/chat/index.tsx`, `src/app/routes/app/chat/$id.tsx`
- Liste : conversations triées par dernier message, badges non lus.
- Détail : composant chat type messenger, input, scroll auto, indicator typing optionnel.
- Hook `useAuraBroadcastSubscription("conversation:" + id, callback)`.
- **AC** : UX fluide, dark mode cohérent avec luminous.

### T10.4 Marquage lu

- **Fichier** : `src/operations/chat/mark-read.operation.ts`
- Append `ctx.user.id` dans `ChatMessage.readBy` Json (ou table dédiée si besoin de granularité).
- **AC** : badge non lu disparaît côté liste après ouverture.

### T10.5 Limites & garde-fous

- Rate-limit chat : 60 messages/minute par user (DB-backed).
- Bloque envoi si `Conversation.status === "DISPUTED"` ou `"CLOSED"`.
- **AC** : essai de 100 envois rapides → 60 passent, 40 rejetés `RATE_LIMITED`.

### T10.6 Snapshot conversation pour litige

- **Fichier** : `src/lib/conversation-snapshot.ts`
- Fonction `buildSnapshot(conversationId)` : retourne JSON `{ messages: [...], participants: [...], capturedAt }`.
- **AC** : utilisée par `disputes.create` (vague 11), reproductible et stable.

---

## Vague 11 — Notations + Litiges + Suspensions

> **Objectif** : cycle complet réputation et modération. 3 avertissements = suspension auto.

### T11.1 Operations `ratings.{create,list-for-user}`

- **Fichiers** : `src/operations/ratings/create.operation.ts`, `list-for-user.operation.ts`
- `create`: `.mutate().input({ conversationId, score: 1..5, comment?: max 500 }).entities(["Rating","Profile"]).auth()`. Vérifie participation à la conversation, unicité par `(conversationId, raterId)`.
- Met à jour `Profile.ratingAvg` et `ratingCount` (denormalisé pour perf).
- **AC** : un user peut noter chaque conversation 1 fois.

### T11.2 Operation `disputes.create`

- **Fichier** : `src/operations/disputes/create.operation.ts`
- `.mutate().input({ conversationId, reason: max 500 }).entities(["Dispute","Conversation"]).auth()`.
- Snapshot via `buildSnapshot()`. Conversation passée en status DISPUTED. Diffuse sur room `admin:disputes`. Notif WhatsApp accusé de réception au reporter.
- **AC** : un signalement crée la dispute et alerte les admins en temps réel.

### T11.3 Operation `disputes.resolve`

- **Fichier** : `src/operations/disputes/resolve.operation.ts`
- `.mutate().input({ disputeId, decision: enum, internalNote? }).auth()` — accès limité aux admins via middleware `with-admin.middleware.ts`.
- Decisions : `DISMISS | WARN_REPORTER | WARN_REPORTED | WARN_BOTH | SUSPEND_REPORTED | SUSPEND_BOTH`.
- Incrémente `warningCount` selon décision. Auto-suspend si ≥ 3.
- Notification WhatsApp explicative au(x) sanctionné(s).
- **AC** : 3 warnings successifs → status auto-passe à SUSPENDED.

### T11.4 Middleware admin `with-admin.middleware.ts`

- **Fichier** : `src/operations/_middleware/with-admin.middleware.ts`
- Lève `FORBIDDEN` si `ctx.user.isAdmin !== true`.
- **AC** : appelé sur toute opération admin, un user normal reçoit 403.

### T11.5 Operations `users.{suspend,reactivate}`

- **Fichiers** : `src/operations/admin/users/suspend.operation.ts`, `reactivate.operation.ts`
- `suspend` : input `{ userId, reason: required, durationDays? }`. Audit log obligatoire. Notif WhatsApp.
- `reactivate` : reset `warningCount=0`, status=ACTIVE.
- **AC** : suspension manuelle indépendante des warnings.

### T11.6 Page profil public reputation

- **Fichier** : `src/app/routes/p/$alias.tsx` (extension)
- Section « Réputation » : moyenne, nombre d'avis, badge vérifié si `isVerified`.
- **AC** : un visiteur voit la réputation publique d'un prestataire sans login.

---

## Vague 12 — Admin Dashboard complet

> **Objectif** : un cockpit admin qui voit TOUT — conversations live, agents, KG, sessions de matching, coûts LLM, santé Evolution API, litiges, audit, impersonation read-only.

### T12.1 Shell admin `/admin/_layout.tsx` + garde

- **Fichier** : `src/app/routes/admin/_layout.tsx`
- `<AuraDashboardShell>` avec sidebar : Tableau de bord, Utilisateurs, WhatsApp Live, Agents, Knowledge Graph, Match Sessions, Conversations, Litiges, LLM Usage, Evolution API, Audit, Paiements.
- Garde `<AuraGuardView>` qui lève si `auth.me.user.isAdmin !== true`.
- **AC** : un user normal qui tape `/admin` est redirigé.

### T12.2 `/admin/users` + détail

- **Fichiers** : `src/app/routes/admin/users/index.tsx`, `src/app/routes/admin/users/$id.tsx`
- Liste : `<AuraDataTable>` avec colonnes phone/alias/role/status/createdAt, recherche, filtres.
- Détail : profil complet, sessions actives, audit log, actions Suspend/Reactivate/Impersonate.
- **AC** : admin peut filtrer et agir sur chaque user.

### T12.3 `/admin/whatsapp/conversations-live`

- **Fichier** : `src/app/routes/admin/whatsapp/conversations-live.tsx`
- Vue temps réel des threads agents actifs (dernier message < 30 min). Subscription broadcast `admin:agent-flow`.
- Click → drill-in `/admin/users/:id/agent`.
- **AC** : admin voit chaque conversation IA en cours, en live.

### T12.4 `/admin/users/$id/agent` (drill-in agent)

- **Fichier** : `src/app/routes/admin/users/$id.agent.tsx`
- 3 colonnes : (1) historique complet `AuraAgentMessage` paginé, (2) état LangGraph courant (JSON pretty), (3) state hydraté (Profile + Services chargés).
- Bouton « Replay last incoming » pour rejouer le dernier message.
- **AC** : admin peut diagnostiquer un comportement anormal de l'agent en 30 s.

### T12.5 `/admin/knowledge-graph`

- **Fichier** : `src/app/routes/admin/knowledge-graph/index.tsx`, `src/app/routes/admin/knowledge-graph/$userId.tsx`
- Liste users avec count entités. Drill-in : table entités + relations + actions de correction manuelle (delete entity, edit value).
- **AC** : admin peut nettoyer les entités fausses (ex: skill mal extrait).

### T12.6 `/admin/match-sessions` + `/admin/llm-usage` + `/admin/evolution-api`

- **Fichiers** : `src/app/routes/admin/match-sessions/index.tsx`, `src/app/routes/admin/llm-usage.tsx`, `src/app/routes/admin/evolution-api.tsx`
- Match sessions : table avec query, intent, latence, top-5 picked.
- LLM usage : agrégats `AuraAIUsage` (tokens/jour, coût estimé, latence p95) avec recharts.
- Evolution API : appel temps réel à `/instance/connectionState/{instance}` et `/webhook/find/{instance}`. Bouton « Reconfigurer le webhook ».
- **AC** : admin a toutes les métriques opérationnelles sur 3 pages.

### T12.7 `/admin/disputes` + `/admin/audit` + `/admin/impersonate`

- **Fichiers** : `src/app/routes/admin/disputes/index.tsx`, `$id.tsx`, `src/app/routes/admin/audit.tsx`, `src/lib/impersonation.ts`
- Disputes : liste filtrée, détail avec snapshot complet + actions resolve.
- Audit : `<AuraDataTable>` sur `AuraAuditLog`, recherche par actor/action/operation.
- Impersonation **read-only** : admin clique « voir comme » un user. Cookie `aura_impersonate=userId` valide 30 min, signé HMAC. Le runner détecte le cookie → le `ctx.user` devient le user cible mais toutes les mutations lèvent `FORBIDDEN`. Bandeau visible permanent « Vous voyez en tant que [alias]. Pas d'action possible. »
- **AC** : admin peut diagnostiquer le dashboard d'un user sans risque d'altérer ses données.

---

## Vague 13 — Monétisation (UI + DB complets, paiement TODO)

> **Objectif** : tout est prêt pour activer la monétisation en flippant `PAYMENTS_ENABLED=true`, mais aucun paiement réel n'est fait pour le MVP.

### T13.1 Provider abstrait + stub Fapshi

- **Fichiers** : `src/lib/payments/provider.ts`, `src/lib/payments/fapshi-stub.ts`, `src/lib/payments/factory.ts`
- Interface `PaymentProvider`: `initiate({ userId, amountXaf, kind, idempotencyKey }): Promise<{ checkoutUrl, providerTransId }>`, `getStatus(providerTransId): Promise<Status>`, `verifyWebhook(rawBody, signature): boolean`.
- `FapshiProviderStub` : retourne des URLs simulées, persiste un `Payment` en `PENDING`. Si `PAYMENTS_ENABLED=false`, lève `BAD_REQUEST("Les paiements ne sont pas encore actifs")`.
- **AC** : interface stable, prête à recevoir une vraie implémentation Fapshi en 1 PR.

### T13.2 Operations `payments.{start-checkout,get-status}`

- **Fichiers** : `src/operations/payments/start-checkout.operation.ts`, `get-status.operation.ts`
- `start-checkout`: `.action().input({ kind: enum BADGE|BOOST|PRO }).auth()`. Génère idempotency key, appelle provider.
- Si flag off, retourne `{ pending: true, message: "Activation prévue prochainement." }`.
- **AC** : flag off → message UI ; flag on (test) → URL retournée.

### T13.3 Webhook `/webhooks/fapshi` (stub signé)

- **Fichier** : `src/operations/webhooks/fapshi.http.ts`
- HTTP action POST publique CSRF off. Validation HMAC stub (à brancher sur signature Fapshi réelle plus tard). Idempotence par `providerTransId`.
- Active `Subscription` ou `BoostSlot` ou `Profile.isVerified=true` selon le kind.
- Notif WhatsApp confirmation.
- **AC** : appelable via curl avec signature mockée, met à jour la DB, idempotent.

### T13.4 Route `/app/billing` (Member)

- **Fichier** : `src/app/routes/app/billing.tsx`
- 3 cards : Badge Vérifié (10 000 FCFA/an), Boost (1 000 FCFA / 7j, top 3), Pro (3 000 FCFA/mois, illimité).
- CTA : si flag off → bouton désactivé « Bientôt disponible » avec waitlist email collect optional ; si flag on → modale Mobile Money.
- **AC** : page rendue propre, pas de paiement réel en MVP.

### T13.5 Cron `subscriptions.expire-pro` et `boosts.expire`

- **Fichiers** : `src/operations/subscriptions/expire-pro.cron.ts`, `src/operations/boosts/expire.cron.ts`
- Schedule `0 * * * *` (chaque heure). Passe les `Subscription.endsAt < now` à EXPIRED, `BoostSlot.endsAt < now` à EXPIRED. Audit + notif WhatsApp.
- **AC** : un Pro qui expire passe à EXPIRED et reçoit notification.

### T13.6 Admin `/admin/payments`

- **Fichier** : `src/app/routes/admin/payments/index.tsx`
- Table paiements + filters + total flux. Lien vers user.
- **AC** : admin a la vue financière même si elle est vide en MVP.

---

## Vague 14 — Hardening + Eval + Production-ready

> **Objectif** : qualité, observabilité, déploiement. Tout vert pour la mise en main.

### T14.1 Eval LLM golden set

- **Fichiers** : `evals/golden-set.json`, `evals/run.ts`, `package.json` (`"eval"`)
- 30 inputs FR couvrant : recherche prestataire, recherche connexion, chat, gestion compte, hors-périmètre, tutoiement piège, ambiguïté.
- Score : conformité persona (regex tutoiement = 0), intent correctement classifié, latence p95 < 4 s.
- **AC** : `bun run eval` produit un rapport JSON ; CI échoue si conformité < 95%.

### T14.2 Vitest critical paths

- **Fichiers** : `src/operations/webhooks/whatsapp.http.test.ts`, `src/operations/auth/_otp-rate-limit.test.ts`, `src/operations/matches/_double-optin.test.ts`, `src/operations/matching/_diversity.test.ts`, `src/operations/disputes/_auto-suspend.test.ts`
- 5 tests d'intégration pour les chemins critiques.
- **AC** : `bun run test` passe en < 60 s.

### T14.3 `aura:doctor` strict + lint

- Ajouter au CI : `bun aura:doctor --strict` + `tsc --noEmit`.
- **AC** : CI rouge si une convention est violée.

### T14.4 Backup + restore

- **Fichiers** : `scripts/backup-pg.sh`, `scripts/restore-pg.sh`, `docs/runbook-backup.md`
- pg_dump quotidien vers `./backups/` avec rotation 14 jours.
- **AC** : script testé manuellement, restore d'un dump fonctionne.

### T14.5 Runbook ops `docs/runbook.md`

- Procédures : Evolution API down, broadcast down, DB migration rollback, OpenRouter rate-limited, Fapshi stub vs reel.
- **AC** : un nouvel ops peut intervenir avec ce runbook seul.

### T14.6 Production env + secrets

- **Fichiers** : `.env.example`, `docs/deploy.md`, `docker-compose.prod.yml`
- Liste exhaustive secrets, génération via openssl, NODE_ENV=production, sticky session pour broadcast.
- **AC** : un nouveau dev clone le repo et lance prod en 30 min.

### T14.7 Smoke test scripts + monitoring

- **Fichiers** : `scripts/smoke.sh`, `docs/monitoring.md`
- 10 curl/playwright qui valident : landing accessible, OTP ping, /admin garde, webhook ping, agent répond, broadcast WS connecte.
- Plan monitoring : Prometheus exporter pour `AuraAIUsage`, dashboards Grafana suggérés.
- **AC** : `bun run smoke` retourne 0 si tout sain.

---

## Annexe — Variables d'environnement à ajouter

```bash
# Evolution API (WhatsApp)
EVOLUTION_API_BASE_URL=https://evo-admin.globalimex.online
EVOLUTION_API_INSTANCE_ID=test
EVOLUTION_API_KEY=RPCJl6kIyBay1tOlOu7G1kbzb8wjjXOM
WHATSAPP_WEBHOOK_SECRET=<32-bytes-base64url>

# Application
PUBLIC_APP_URL=http://10.238.48.99:3000

# Feature flags
PAYMENTS_ENABLED=false
KNOWLEDGE_GRAPH_HYBRID_ENABLED=false
VOICE_AUTH_ENABLED=false

# AI
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-... # pour les embeddings text-embedding-3-small

# Paiements (placeholder, désactivés)
FAPSHI_API_KEY=
FAPSHI_WEBHOOK_SECRET=
```

---

## Annexe — Mapping User Stories ↔ Vagues

| User Story | Vague(s) |
|---|---|
| A1-A5 (Visiteur, landing, démo) | 3 |
| B1-B2 (Auth OTP) | 2 |
| B3 (Profil) | 4 |
| B4 (Bot WhatsApp) | 6, 7 |
| B5 (Liste matchs) | 9 |
| B6 (Chat anonyme) | 10 |
| B7 (Notation) | 11 |
| B8 (Litige) | 11 |
| B9 (Langue) | 4 |
| C1-C6 (Prestataire) | 5, 11, 13 |
| D1-D5 (Client) | 7, 8, 9, 10 |
| E1 (Admin auth) | 2 |
| E2 (Vue conversations live) | 12 |
| E3 (Drill-in agent) | 12 |
| E4 (Knowledge Graph) | 7, 12 |
| E5 (Match sessions) | 8, 12 |
| E6 (Litiges) | 11, 12 |
| E7 (Suspension manuelle) | 11 |
| E8 (Coût LLM) | 12 |
| E9 (Métriques business) | 12 |
| E10 (Impersonation read-only) | 12 |
| E11 (Health Evolution API) | 12 |

---

## Critères de Done globaux

- ✅ `bun run test` : tous les tests passent
- ✅ `bun aura:doctor --strict` : aucune violation
- ✅ `tsc --noEmit` : aucune erreur de type
- ✅ `bun run build` : build production succès
- ✅ Eval LLM golden set : conformité persona ≥ 95%, latence p95 ≤ 4 s
- ✅ Smoke test : 10/10 verts
- ✅ Documentation : runbook + deploy + monitoring complets
- ✅ Aucun TODO bloquant restant dans le code (les TODO paiement sont assumés)
