# Mémo Réinitialisation — Contexte Complet (Session Entière)

## 1. PREMIERS CONTACTS — Configuration Projet

### Palette CSS
L'utilisateur a demandé des changements de palette CSS dans `src/styles.css`. J'ai essayé plusieurs palettes :
1. Chaude/sable → "trop sombre"
2. Coral/mint/purple → "trop morose"
3. Plus saturée → encore "trop morose"  
4. Coral/sky/sunny → "c'est trop morose"
5. Hot pink/cyan/gold → "vives pas plates"
6. Violet/teal/tangerine → rejeté
7. Lime/fuchsia/aqua → rejeté
8. Rose-rouge/teal/gold → rejeté
9. Palette actuelle avec outfit font

**Leçon :** L'utilisateur est exigeant sur le design. Ne pas proposer des palettes au hasard.

### Cloudflare Tunnel
- L'utilisateur a fait tourner `npx cloudflared tunnel --url http://localhost:3000`
- Puis a installé son propre service avec token : `sudo cloudflared service install <token>`
- Mot de passe sudo : `123456`
- Son domaine : `orya.globalimex.online`
- A dû ajouter le host à `vite.config.ts` → `server: { allowedHosts: ["orya.globalimex.online"] }`

### Evolution API
- L'utilisateur a montré le dashboard Evolution API (webhook config)
- Le webhook URL était vide → pointer vers l'app via cloudflared

---

## 2. SPECS & CODEBASE

### Structure du projet
- Framework **Aura** : TanStack Start + Hono + Prisma + PostgreSQL/pgvector
- Deux specs :
  - `.kiro/specs/aura-hono-tanstack-migration/` → le framework core
  - `.kiro/specs/whatsapp-ai-matchmaking-platform/` → le projet Orya
- Docs Aura : `docs/*.md`
- Routes TanStack : `src/app/routes/`
- Operations : `src/operations/`
- Core Aura : `src/aura/`

### Home Page (`src/app/routes/index.tsx`)
- Landing page "Orya" : connexions via WhatsApp
- "Connecte les gens entre eux. Mêmes intérêts, même quartier, mêmes ambitions. Sur WhatsApp."
- Pas d'app à télécharger, que WhatsApp

### Messages WhatsApp en batch
**Important :** WhatsApp n'est PAS 1 message = 1 réponse. Le webhook recoit des BATCHES de messages. Le bot doit gérer ça correctement.

---

## 3. ANALYSE CODEBASE VS SPECS (analysis.md)

J'ai fait une première analyse que l'utilisateur a CORRIGÉE. J'avais dit que plusieurs features n'existaient pas alors qu'elles étaient déjà implémentées.

### Ce que j'ai dit FAUX (corrigé par l'utilisateur) :
- `AuraStoredFile` n'existe pas → **FAUX**, il existe dans `prisma/schema.prisma` ligne 227
- `ctx.invalidate({entity, id})` n'existe pas → **FAUX**, il existe dans `create-context.ts` ligne 192
- `api.ts` codegen n'existe pas → **FAUX**, `src/aura/_generated/api.ts` existe (87 lignes)
- `defineSearchIndex` n'existe pas → **FAUX**, `src/aura/server/search.ts` ligne 27
- `defineVectorIndex` n'existe pas → **FAUX**, `src/aura/server/vector.ts` ligne 22
- `defineComponent` n'existe pas → **FAUX**, `src/aura/core/component.ts` ligne 43
- `ctx.scheduler.runAfter/runAt` n'existe pas → **FAUX**, `scheduler.ts` ligne 24, branché dans `create-context.ts`
- `ctx.storage.store/getUrl` n'existe pas → **FAUX**, `storage/index.ts` lignes 156-176
- R4 (DB-optimized reads) pas implémenté → **FAUX**, `defineDbReadFn` existe dans `db-read.ts`

**Leçon : TOUJOURS vérifier le code avant d'écrire. Ne pas présumer qu'une feature n'existe pas.**

### Vrais problèmes identifiés (corrigés) :

| # | Problème | Sévérité | Fichiers |
|---|----------|----------|----------|
| 1 | 3 actions utilisent `ctx.db.*` → CRASHENT | 🔴 | `process-incoming`, `matching/run`, `start-checkout` |
| 2 | Auth ops référencent champs inexistants (`businessName`, `countryId`, etc.) | 🔴 | `src/aura/server/auth/operations.ts:38-50` |
| 3 | `operationAsTool` perd le contexte (session/user) | 🟡 | `src/aura/server/ai/agent.ts:131-138` |
| 4 | `.asTool()` sur OperationRef inexistant | 🟡 | Commentaire seulement dans agent.ts |
| 5 | Agent streaming via hack `__agent_stream:` au lieu de rooms WS | 🟢 | `agent.ts:332-340` |

---

## 4. ARCHITECTURE AURA — Les Patterns Corrects

### Pipeline : requirements → design → implémentation
**Toujours** dans cet ordre. L'utilisateur insiste beaucoup là-dessus.

### Le Pattern `AuraService`

L'utilisateur a validé ce pattern après plusieurs essais/erreurs :

```ts
// Operation = thin transport
defineOperationFn("x")
  .query().input(z).entities([...]).auth()
  .handler(async ({ ctx, input }) => {
    const svc = new MonService(ctx);  // ctx passé au constructeur
    return svc.method(input);
  });

// Service = logique métier
class MonService extends AuraService {
  async method(input: Input) {
    return this.db.model.create({ data: input });  // this.db, this.user, etc.
  }
}
```

**Fichier :** `src/aura/server/service.ts`
**Dossier services :** `src/operations/_services/`

### Ce qui est disponible via `this.*` dans AuraService

| Propriété | Source |
|-----------|--------|
| `this.db` | `ctx.db` (PrismaClient) |
| `this.user` | `ctx.user` |
| `this.session` | `ctx.session` |
| `this.agent` | `ctx.agent` |
| `this.scheduler` | `ctx.scheduler` |
| `this.storage` | `ctx.storage` |
| `this.notify` | `ctx.notify` (NotificationDispatcher) |
| `this.log` | `ctx.log` |
| `this.audit` | `ctx.audit` |
| `this.invalidate(target)` | `ctx.invalidate` |
| `this.paginate(model, opts)` | `ctx.paginate` |
| `this.runQuery(ref, input)` | `ctx.runQuery` |
| `this.runMutation(ref, input)` | `ctx.runMutation` |
| `this.runAction(ref, input)` | `ctx.runAction` |

### AuraError vs ctx.log.error vs Error

| Code | Effet |
|------|-------|
| `throw new AuraError("NOT_FOUND", "msg")` | Retourné au client dans l'enveloppe JSON |
| `ctx.log.error("msg", { detail })` | Log serveur seulement |
| `throw new Error("msg")` | **À ÉVITER** → 500 sans message clair |

### Le Pattern Notification (defineNotificationFn)

**NE PAS** créer de helpers manuels. Utiliser le built-in Aura :

```ts
// Définition (fichier dans src/operations/notifications/)
export default defineNotificationFn("nom")
  .payload(z.object({ phoneE164: z.string() }))
  .handler(async ({ payload }) => {
    await gateway.sendText(payload.phoneE164, "Message", `key-${Date.now()}`);
  });

// Dispatch (depuis n'importe où dans un handler/service)
ctx.notify.via("nom").send(payload).catch(() => {});
```

Les notifications sont auto-enregistrées via des side-effect imports dans `src/operations/_registry.ts`.

### Le Problème `.action()`

Les actions ont un DB Proxy tombstoné : `ctx.db` throw sur toute tentative d'accès.
**Solution :** Utiliser `.mutate()` + service pour les opérations qui font à la fois DB + side effects.
**OU** utiliser `ctx.runQuery/runMutation` depuis une action.

---

## 5. LES 7 SERVICES DU DESIGN WHATSAPP

| Couche | Service | Fichier | Statut |
|--------|---------|---------|--------|
| 1. Transport WhatsApp | `InboxService` | `_services/inbox-service.ts` | ✅ Fait |
| 2. Instance IA | `UserAgentService` | `_services/user-agent-service.ts` | ⏳ À faire |
| 3. Orchestrateur Matching | `MatchingService` | `_services/matching-service.ts` | ✅ Fait (v1 keyword) |
| 4. Knowledge Graph | `KnowledgeGraphService` | `_services/knowledge-graph-service.ts` | ⏳ À faire |
| 5. Chat Temps Réel | `ChatService` | `_services/chat-service.ts` | ✅ Fait |
| 6. Paiement | `PaymentService` | `_services/payment-service.ts` | ✅ Fait |
| 7. Observabilité IA | `ObservabilityService` | `_services/observability-service.ts` | ⏳ À faire |
| Cross-cutting | `AliasService` | `_services/alias-service.ts` | ✅ Fait |

---

## 6. TOUS LES COMMITS

| Hash | Message |
|------|---------|
| `18eb26e` | feat(phase1): WhatsApp link code, alias FR/EN, notifications, lang detection |
| `51bad52` | feat(dev): WhatsApp chat simulator widget for local dev |
| `de6e568` | refactor(notifications): use defineNotificationFn, add AuraService pattern |
| `c082e14` | feat(aura): add AuraService base class + AliasService |
| `4c71181` | feat(services): InboxService + AliasService tests |
| `1ce40dc` | feat(services): MatchingService, PaymentService, ChatService |
| `320f1b3` | docs: update AGENTS.md, operations.md, folder-conventions.md |
| `32c2d1e` | chore: add MEMO.md with full context for reset |

---

## 7. ACTIONS À VENIR (Priorité)

1. **AuthService** (`_services/auth-service.ts`) — refactor auth ops
2. **ProfileService** (`_services/profile-service.ts`) — R3-R4
3. **UserAgentService** (`_services/user-agent-service.ts`) — agent IA par utilisateur + extraction LLM + intention
4. **WebSocket rooms** — broadcast `/ws/chat` avec pub/sub room-based
5. **KnowledgeGraphService** — CTE récursive, pgvector, embeddings
6. **ObservabilityService** — métriques business/IA
7. **Tests E2E + Docker compose**

---

## 8. ERREURS À NE PAS RÉPÉTER (AMÉLIORÉ)

### 🔴 Erreurs d'analyse (les pires)

1. **Ne JAMAIS dire qu'une feature n'existe pas sans vérifier le code.**
   - J'ai dit que `AuraStoredFile`, `ctx.invalidate`, `api.ts`, `defineSearchIndex`, `defineVectorIndex`, `defineComponent`, `ctx.scheduler`, `ctx.storage.store/getUrl` n'existaient PAS.
   - **Tout existait déjà.** L'utilisateur m'a corrigé.
   - ✅ **Correction :** `grep` ou `read` les fichiers avant d'affirmer quoi que ce soit.

2. **Ne JAMAIS faire une analyse biaisée.**
   - J'ai dit R4, R17, R18, R22, R23, R24, R26, R27, R28 étaient "pas implémentés".
   - **Tout était implémenté.** J'ai dû réécrire l'analyse entière.
   - ✅ **Correction :** Vérifier CHAQUE requirement un par un avec le code sous les yeux.

### 🔴 Erreurs de code

3. **Import `@/_services/` ne fonctionne PAS.**
   - J'ai écrit `import { PaymentService } from "@/_services/payment-service"`
   - ✅ **Correction :** `import { PaymentService } from "@/operations/_services/payment-service"`

4. **Ne PAS créer de helpers manuels pour les notifications.**
   - J'ai créé `src/lib/notifications/send.ts` avec des fonctions manuelles.
   - L'utilisateur a dit "j'aime pas" et m'a forcé à utiliser `defineNotificationFn`.
   - ✅ **Correction :** `defineNotificationFn("name").payload(z).handler(fn)` + `ctx.notify.via("name").send(payload)`

5. **Ne PAS mettre `ctx.db.*` dans une `.action()`.**
   - 3 opérations crashent à cause du DB Proxy tombstoné.
   - ✅ **Correction :** Soit `.mutate()` + service, soit `ctx.runQuery/runMutation()` depuis l'action.

6. **Ne PAS laisser `throw new Error("message")` dans un handler.**
   - Ça donne un 500 sans message clair pour le client.
   - ✅ **Correction :** Toujours `throw new AuraError("CODE", "message")`.

7. **Les notifications ont besoin de side-effect imports dans `_registry.ts`.**
   - Sans ça, elles ne sont jamais enregistrées et `hasNotification()` retourne false.
   - ✅ **Correction :** Ajouter `import "./notifications/mon-fichier.notification"` dans `_registry.ts`.

8. **Les tests de notification doivent importer les fichiers `.notification.ts`.**
   - ✅ **Correction :** Mettre les imports en haut du fichier test.

### 🟡 Erreurs de workflow

9. **Ne PAS skip la relecture des fichiers créés/modifiés.**
   - ✅ **Correction :** Lire chaque fichier après l'avoir écrit/modifié.

10. **Ne PAS ignorer le pipeline : specs → design → implémentation.**
    - L'utilisateur insiste : requirements d'abord, design ensuite, tâches enfin.
    - ✅ **Correction :** Lire `.kiro/specs/.../requirements.md` puis `design.md` avant d'écrire une ligne.

11. **Ne PAS ignorer les docs Aura.**
    - L'utilisateur m'a envoyé lire `docs/` après que j'ai fait n'importe quoi.
    - ✅ **Correction :** Lire `docs/<sujet>.md` AVANT d'implémenter une feature.

12. **Ne PAS proposer des palettes CSS au hasard.**
    - J'ai changé la palette 8 fois sans demander ce qu'il voulait.
    - ✅ **Correction :** Demander le style/ambiance avant de modifier.

### 🟡 Erreurs UI/design

13. **Le widget dev/chat doit avoir une SIDEBAR avec contacts, pas des tabs.**
    - J'ai fait un sélecteur + tabs, l'utilisateur voulait une sidebar WhatsApp Web.
    - ✅ **Correction :** Sidebar contacts à gauche + chat panel à droite.

14. **WhatsApp fonctionne en BATCH, pas en 1 msg = 1 réponse.**
    - Le webhook reçoit plusieurs messages à la fois.
    - ✅ **Correction :** Tenir compte du flux batch dans le traitement.

15. **TOUT dans un seul fichier au lieu de split en composants indépendants.**
    - J'ai mis `DevChatPage`, `ChatConversation`, les types, les helpers TOUT dans `dev/chat.tsx`.
    - L'utilisateur m'a demandé de split en composants réutilisables avec leurs propres fichiers et props.
    - J'ai ignoré et tout laissé dans un monolithe.
    - ❌ **Fausse correction :** Mettre dans `src/aura/ui/` — c'est pour les composants internes d'Aura.
    - ✅ **Correction :** Organisation par feature dans `src/components/<feature>/` :
      ```
      src/components/chat/
      ├── chat-sidebar.tsx
      ├── chat-conversation.tsx
      ├── chat-message.tsx
      └── chat-input.tsx
      src/components/contacts/
      ├── contact-list.tsx
      └── contact-card.tsx
      ```
