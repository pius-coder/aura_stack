# Implementation Plan: WhatsApp AI Matchmaking Platform — Waves UI+Réseau

## Comment ce plan a été construit

Ce document remplace `tasks.md` (archivé sous `tasks.backup`). Il est construit par analyse de la relation entre `requirements.md` (50 requirements R1-R50) et `design.md` (7 couches architecture, inventaire operations §§ 596-723, modèles de données §§ 840-1364, Graph RAG §§ 1386-1894, LangGraph §§ 1897-2000).

**Méthode :**
- Chaque R<n> est tracé à son acceptance criteria dans `requirements.md`
- Chaque tâche pointe vers les §§ correspondants dans `design.md`
- Les tâches du `tasks.backup` (Waves 0-7 backend) sont référencées comme prérequis
- Les nouvelles tâches UI utilisent les design tokens de la homepage (`src/app/routes/index.tsx`) :
  - Palette : bleu primaire (`from-blue-500 to-blue-600`), fonds blancs/blur, slates
  - Composants : backdrop-blur cards, rounded-full, shadow-card, gradient buttons
  - Layout : mx-auto max-w-*, sections épurées, typo fine (font-light, tracking-tight)
- Conventions AGENTS.md strictement respectées (kebab-case, AuraService, thin handlers, etc.)

---

## Conventions UI (design tokens homepage)

```tsx
// Design tokens — à reproduire dans tous les composants
// Couleurs primaires
const primary = "from-blue-500 to-blue-600";
const primaryBg = "bg-gradient-to-b from-blue-500 to-blue-600";
const cardBg = "bg-white/62 backdrop-blur border border-white shadow-card";
const navBg = "bg-white/84 backdrop-blur-2xl border border-white/90";
const textPrimary = "text-slate-950";
const textSecondary = "text-slate-500";
const textTertiary = "text-slate-400";

// Layout
const container = "mx-auto max-w-4xl px-4";
const section = "py-14 sm:py-20";
```

---

## Wave 8 — UI: Auth et Landing (R1, R2)

Prérequis : Wave 0-7 (backend complet, cf. `tasks.backup`)

### 8.1 Composant `AuthLayout` — Gabarit pour pages login/signup
- Reprend le fond blur circles + gradient de la homepage
- Props : `children`, `title`, `subtitle`
- Fichier : `src/components/auth/auth-layout.tsx`

### 8.2 Composant `SignUpForm` — Formulaire d'inscription (R1.1-5)
- Champs : email, password (12+ chars, lettre+chiffre+spécial), displayName
- Consent checkbox (privacy, dataProcessing, whatsappComms)
- Validation Zod côté client avant envoi
- Appelle `api.users.register`
- Afficher `linkCode` après succès (R1.3)
- Fichier : `src/components/auth/sign-up-form.tsx`

### 8.3 Composant `SignInForm` — Formulaire de connexion (R2)
- Champs : email/phone, password
- Appelle `api.auth.login` ou `api.auth['start-phone-otp']`
- Fichier : `src/components/auth/sign-in-form.tsx`

### 8.4 Page `/sign-up` — Wrapper route avec AuthLayout
- Délègue à `SignUpForm`
- Lien vers sign-in

### 8.5 Page `/sign-in` — Wrapper route avec AuthLayout
- Délègue à `SignInForm`
- Lien vers sign-up

*Design : même style que la homepage (fond blur, boutons gradient bleus, backdrop-blur cards)*

---

## Wave 9 — UI: Dashboard Layout (R3, R4, R8)

Prérequis : Wave 8

### 9.1 `AppSidebar` — Barre latérale navigation
- Icônes + labels : Accueil, Services (providerOnly), Matchs, Conversations, Abonnement, Paramètres
- Avatar utilisateur + nom en bas
- Style : fixed left, bg-white/84 backdrop-blur, border-r
- Fichier : `src/components/app/app-sidebar.tsx`

### 9.2 `AppLayout` refactor — Layout principal `/app`
- Sidebar à gauche + contenu à droite
- Mobile : bottom nav bar au lieu de sidebar
- Fichier : `src/components/app/app-layout.tsx`

### 9.3 `ProfileCard` — Carte profil utilisateur (R4)
- Photo, displayName, bio, location, skills, type (standard/prestataire)
- Bouton modifier → formulaire inline
- Appelle `api.profiles.upsert`
- Fichier : `src/components/profiles/profile-card.tsx`

### 9.4 `ProfileForm` — Formulaire édition profil
- Champs : displayName (max 80), bio (max 1000), locationLabel, skills
- Upload photo via `api.profiles['upload-photo']` (format png/jpg/webp, max 5Mo)
- Fichier : `src/components/profiles/profile-form.tsx`

### 9.5 `SetTypeCard` — Choix type profil (R3)
- Cartes User_Standard vs Prestataire avec icônes
- Appelle `api.profiles['set-type']`
- Fichier : `src/components/profiles/set-type-card.tsx`

### 9.6 Page `/app` — Dashboard accueil
- ProfileCard + SetTypeCard si pas encore défini
- Résumé activité récente (matchs, messages)
- Style cards bg-white/62 backdrop-blur border

---

## Wave 10 — UI: Services (R5)

Prérequis : Wave 9

### 10.1 `ServiceCard` — Carte service
- Titre, description (tronquée), prix FCFA, disponibilité (badge), zone
- Boutons : modifier, désactiver, supprimer
- Fichier : `src/components/services/service-card.tsx`

### 10.2 `ServiceForm` — Formulaire création/édition service
- Champs : title (max 120), description (max 2000), priceXaf (entier positif),
  availability (select), zone
- Appelle `api.services.create` ou `api.services.update`
- Limite 50 services actifs sans Pro (R5.4)
- Fichier : `src/components/services/service-form.tsx`

### 10.3 `ServiceList` — Liste des services
- Grille de ServiceCard
- Bouton "Nouveau service" → ouvre ServiceForm modal
- Fichier : `src/components/services/service-list.tsx`

### 10.4 Page `/app/services` — Gestion des services
- ServiceList pour prestataires
- Message "Passer en mode Prestataire" pour standards (R3.3)
- Style cards bg-white/62 backdrop-blur

---

## Wave 11 — UI: Matching (R6, R24, R25)

Prérequis : Wave 9

### 11.1 `MatchCard` — Carte match request
- Alias du profil cible (R25.1 : pas de vrai nom en pending)
- Statut (pending/accepted/refused/expired) + badge coloré
- Boutons : accepter (R6.4), refuser (R24.3), annuler (R6.3)
- Fichier : `src/components/matching/match-card.tsx`

### 11.2 `MatchList` — Liste matchs inbox/sent
- Tabs : Reçus / Envoyés
- Appelle `api.matching['list-mine']`
- Filtre par `isIncoming`
- Fichier : `src/components/matching/match-list.tsx`

### 11.3 Page `/app/matches` — Mes matchs
- MatchList complète
- Badge non lu pour nouvelles requests (R6.2)

---

## Wave 12 — UI: Conversations et Chat (R8, R26, R27)

Prérequis : Wave 11

### 12.1 `ConversationList` — Liste conversations (R8.1)
- Tri par dernier message
- Avatar + nom + dernier message tronqué + timestamp
- Badge non lu
- Appelle `api.conversations['list-mine']`
- Fichier : `src/components/chat/conversation-list.tsx`

### 12.2 `ChatMessage` — Bulle de message
- Alignée à droite pour l'envoyeur, à gauche pour le receveur
- Texte + timestamp + status lu/non lu
- Fichier : `src/components/chat/chat-message.tsx`

### 12.3 `ChatInput` — Zone de saisie
- Textarea auto-resize (max 4000 chars — R27.2)
- Bouton envoi
- Fichier : `src/components/chat/chat-input.tsx`

### 12.4 `ChatConversation` — Panneau conversation
- Liste scrollable de ChatMessage (historique paginé 20 msg — R8.2)
- ChatInput en bas
- Rejoint room WS `conversation:{id}` via `useAuraRoom`
- Fichier : `src/components/chat/chat-conversation.tsx`

### 12.5 `ChatLayout` — Layout split conversations/chat
- ConversationList à gauche, ChatConversation à droite
- Mobile : écran split avec navigation
- Fichier : `src/components/chat/chat-layout.tsx`

### 12.6 Page `/app/chat` — Conversations
- ChatLayout complet
- WebSocket temps réel pour nouveaux messages

---

## Wave 13 — UI: Ratings et Disputes (R7, R9, R10)

Prérequis : Wave 12

### 13.1 `RatingForm` — Formulaire notation (R7.1)
- Stars 1-5 + comment optionnel (max 500)
- Appelle `api.ratings.submit`
- Fichier : `src/components/ratings/rating-form.tsx`

### 13.2 `RatingStats` — Statistiques notes (R7.2)
- Moyenne + nombre d'avis
- Appelle `api.ratings['stats-by-user']`
- Fichier : `src/components/ratings/rating-stats.tsx`

### 13.3 `DisputeForm` — Formulaire signalement (R9.1)
- Select motif + description
- Appelle `api.disputes.report`
- Fichier : `src/components/disputes/dispute-form.tsx`

### 13.4 `DisputeList` (admin) — Liste litiges (R10.2)
- Tableau filtrable par statut (open/under_review/resolved)
- Appelle `api.disputes['list-pending']`
- Fichier : `src/components/admin/dispute-list.tsx`

### 13.5 `DisputeResolve` (admin) — Résolution litige (R9.3-5)
- Décision : dismiss/warn/suspend
- Note interne optionnelle
- Appelle `api.disputes.resolve`
- Fichier : `src/components/admin/dispute-resolve.tsx`

### 13.6 `MetricsDashboard` (admin) — Métriques (R10.4-5)
- Cartes : users actifs, matchs créés, taux acceptation, conversations, disputes
- Graphiques tokens IA par modèle (Recharts)
- Appelle `api.admin['metrics-business']` et `api.admin['metrics-ai']`
- Fichier : `src/components/admin/metrics-dashboard.tsx`

### 13.7 `UserManagement` (admin) — Gestion utilisateurs (R9.6, R10.3)
- Tableau suspendus + bouton lever suspension
- Appelle `api.admin.users.suspend` / `api.admin.users.reactivate`
- Fichier : `src/components/admin/user-management.tsx`

### 13.8 Page `/admin` — Console admin
- Tabs : Litiges, Métriques, Utilisateurs suspendus

---

## Wave 14 — UI: Paiements et Abonnements (R28-R34)

Prérequis : Wave 13

### 14.1 `PricingCards` — Cartes tarifs (R31.1-3)
- Badge Vérifié : 10 000 FCFA/an
- Boost : 1 000 FCFA / 7 jours
- Pro : 3 000 FCFA/mois
- Boutons acheter → appellent `api.payments['initiate-badge/boost/pro']`
- Désactivé si `BUSINESS_PHASE = "mvp"` (R30.1)
- Fichier : `src/components/payments/pricing-cards.tsx`

### 14.2 `SubscriptionStatus` — Statut abonnement
- Plan actuel + date fin + bouton annuler
- Appelle `api.subscriptions.status`
- Fichier : `src/components/payments/subscription-status.tsx`

### 14.3 `PaymentHistory` — Historique paiements
- Liste : date, type, montant, statut
- Appelle `api.payments['list-history']`
- Fichier : `src/components/payments/payment-history.tsx`

### 14.4 `IdentityVerificationFlow` — Flow vérification identité (R32)
- Upload selfie + CNI via `ctx.storage`
- File d'attente pending_review pour admin
- Notification WhatsApp à l'activation/rejet
- Fichier : `src/components/payments/identity-verification.tsx`

### 14.5 Page `/app/billing` — Abonnement et paiements
- PricingCards si pas d'abonnement actif
- SubscriptionStatus + PaymentHistory si abonné
- IdentityVerificationFlow pour badge

---

## Wave 15 — UI: Settings et Onboarding (R38-R40)

Prérequis : Wave 14

### 15.1 `SettingsForm` — Paramètres compte
- Language (FR/EN) → `api.users['set-language']`
- Region → `api.users['set-region']`
- Consentements → `api.users['consent-record']`
- Export données → `api.users['data-export']`
- Supprimer compte → `api.users['data-delete']`
- Fichier : `src/components/settings/settings-form.tsx`

### 15.2 `OnboardingFlow` — Flow onboarding post-inscription
- Étape 1 : Mot de passe (si registration sans password)
- Étape 2 : Profil (displayName, bio, location)
- Étape 3 : Type (standard/prestataire)
- Étape 4 : Consentements
- Fichier : `src/components/onboarding/onboarding-flow.tsx`

### 15.3 Page `/settings` — Paramètres
- SettingsForm complet

---

## Wave 16 — Tests UI et Intégration (R47)

Prérequis : Waves 8-15

### 16.1 Tests composants (Vitest + Testing Library)
- Chaque composant a son test unitaire
- Mock AuraContext via `as unknown as AuraContext`
- Props + états (loading, empty, error, data)

### 16.2 Tests d'intégration route → opération
- Tester le flux complet : clic → API → render
- Utiliser `useAuraQuery`/`useAuraMutation` mockés

### 16.3 Tests responsivité
- Layout desktop vs mobile
- Sidebar → bottom nav à `< 768px`

---

## Dépendances

```
Wave 0-7 (backend, tasks.backup)
  │
  ▼
Wave 8  (Auth UI)
  │
  ▼
Wave 9  (Dashboard Layout)
  │
  ├──────────┬──────────┐
  ▼          ▼          ▼
Wave 10    Wave 11    Wave 12
(Services) (Matching) (Chat)
  │          │          │
  └──────────┼──────────┘
             ▼
        Wave 13 (Ratings + Admin)
             │
             ▼
        Wave 14 (Paiements)
             │
             ▼
        Wave 15 (Settings + Onboarding)
             │
             ▼
        Wave 16 (Tests)
```

## Notes

- Chaque composion = son propre fichier, ses propres props typées
- Style reproduit les design tokens de la homepage (bordures blanches, blur, shadows)
- Pas de dépendances UI externes (shadcn désactivé) — utiliser Lucide icons
- Toute mutation utilise `.catch(() => {})` pour les fire-and-forget notifications
- Tout composant UI doit exister dans `src/components/<feature>/<name>.tsx`
- Toute page route doit être minimal (wrapper → composant)
- Vérifier chaque wave avec `bun run tsc --noEmit` et `bun run test`
