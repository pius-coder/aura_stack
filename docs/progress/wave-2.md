# Wave 2 — Auth OTP WhatsApp

## Tâches

- ✅ T2.1 — Gateway WhatsApp (interface + EvoApiGateway + factory singleton, retry 3x, idempotence mémoire 5min)
- ✅ T2.2 — Channel WhatsApp pour notifications (intégré directement dans start-phone-otp via gateway)
- ✅ T2.3 — `auth.start-phone-otp` (rate-limit 3/15min, envoi OTP via WhatsApp)
- ✅ T2.4 — `auth.verify-phone-otp` (consomme OTP, crée user+phone+profile si nouveau, ouvre session)
- ✅ T2.5 — `auth.vibe-me` + `auth.vibe-logout`
- ✅ T2.6 — Alias generator (animal-adjectif-4chiffres, 30 animaux × 25 adjectifs = 750 combinaisons × 9000 nums)
- ✅ T2.7 — Middleware `with-profile` (vérifie profil existant + non suspendu)

## Décisions techniques

- Les opérations auth Vibe sont préfixées `auth.start-phone-otp`, `auth.verify-phone-otp`, `auth.vibe-me`, `auth.vibe-logout` pour ne pas entrer en conflit avec les opérations auth legacy GlobalImex.
- L'OTP est envoyé directement via `whatsAppGateway().sendText()` dans l'opération (pas de channel séparé pour le MVP).
- Le code OTP fait 8 chiffres (hérité de `createOtpChallenge`), TTL 10 min.
- À la première connexion, un `AuraUser` + `AuraPhoneIdentity` + `Profile` (avec alias auto) sont créés atomiquement.

## Gates

- `bun run test` : 128 tests passent ✅
- `tsc --noEmit` : 0 erreur ✅
