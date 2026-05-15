# Wave 1 — Fondations DB

## Tâches

- ✅ T1.1 — Schéma Prisma complet (Profile, Service, Match, Conversation, ChatMessage, Rating, Dispute, KnowledgeEntity, KnowledgeRelation, GraphEmbedding, WhatsappInbox, WhatsappOutbox, MatchSession, Payment, Subscription, BoostSlot)
- ⏳ T1.2 — pgvector extension (BLOQUÉ : sudo requis pour `apt install postgresql-18-pgvector`). La colonne `embedding vector(1536)` sera ajoutée via migration SQL dès que l'extension est installée. Le modèle `GraphEmbedding` existe déjà sans la colonne vector.
- ✅ T1.3 — Seed script (1 admin, 20 prestataires, 30 clients, 5 matchs)
- ✅ T1.4 — Registry + codegen régénérés
- ✅ T1.5 — Feature flags (`PAYMENTS_ENABLED`, `KNOWLEDGE_GRAPH_HYBRID_ENABLED`, `VOICE_AUTH_ENABLED`)
- ✅ T1.6 — Storage uploads/ + .gitignore

## Décisions techniques

- `GraphEmbedding.embedding` est déclaré comme modèle Prisma sans la colonne vector native. La colonne sera ajoutée par migration SQL raw quand pgvector sera disponible.
- Le seed utilise `@prisma/adapter-pg` (PrismaPg) comme le reste de l'app.
- `aura:doctor` signale 2 checks Next.js legacy (proxy.ts, bridge route) qui ne s'appliquent pas à TanStack Start — ignorés.

## Gates

- `bun run test` : 128 tests passent ✅
- `tsc --noEmit` : 0 erreur ✅
- `bun run db:push` : succès ✅
- `bun run db:seed` : succès ✅

## TODO restant

- Installer pgvector (`sudo apt install postgresql-18-pgvector`) puis appliquer la migration T1.2.
