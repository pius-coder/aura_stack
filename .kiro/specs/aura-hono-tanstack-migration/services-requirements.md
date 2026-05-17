# Aura Services — Requirements

## Introduction

Les operations Aura actuelles mélangent validation (Zod), logique métier, accès BDD et side effects dans un seul handler. Cela pose trois problèmes :

1. **Les `.action()` crashent** quand le handler utilise `ctx.db.*` (Proxy tombstoné par le runner)
2. **`operationAsTool` crée un contexte frais** sans session/user — les appels à des operations `.auth()` depuis un outil LLM échouent
3. **Pas de réutilisabilité** — la logique métier est prisonnière du handler, impossible à tester unitairement sans monter tout le contexte Aura

Ce document spécifie un nouveau pattern : **AuraService**, une classe de base qui encapsule le contexte Aura et expose toutes ses capacités via `this.*`, permettant d'extraire la logique métier dans des classes testables et réutilisables sans perdre la DX actuelle des operations.

## Glossary

- **AuraService**: Classe de base que les services métier étendent. Reçoit `AuraContext` au constructeur et expose `this.db`, `this.runQuery`, `this.runMutation`, `this.agent`, `this.scheduler`, etc.
- **Service**: Classe qui `extends AuraService` et contient la logique métier d'un domaine (paiement, matching, inbox, etc.)
- **Operation handler**: Le callback `.handler(fn)` de `defineOperationFn` — devient un thin wrapper qui instancie un Service et appelle une méthode

## Requirements

### Requirement 1: AuraService base class

**User Story:** En tant que développeur, je veux une classe AuraService qui expose `this.db`, `this.runQuery`, `this.runMutation`, `this.runAction`, `this.agent`, `this.scheduler`, `this.storage`, `this.paginate`, `this.invalidate`, `this.log`, `this.audit`, `this.bump`, `this.notify`, `this.requestId`, `this.source`, `this.request`, `this.session`, `this.user`, `this.auth`, `this.cookies`, `this.fetch` pour que mes services aient accès à toutes les capacités d'Aura.

#### Acceptance Criteria

1. AuraService SHALL accepter `AuraContext` au constructeur et la stocker comme propriété privée `#ctx`.
2. AuraService SHALL exposer `get db()` qui retourne `this.#ctx.db`.
3. AuraService SHALL exposer `get session()` / `get user()` qui retournent `this.#ctx.session` / `this.#ctx.user`.
4. AuraService SHALL exposer `runQuery(ref, input)`, `runMutation(ref, input)`, `runAction(ref, input)` qui délèguent à `this.#ctx.runQuery/runMutation/runAction`.
5. AuraService SHALL exposer `get agent()`, `get scheduler()`, `get storage()`, `get log()`, `get audit()`, `get notify()`, `get bump()`, `get paginate()`.
6. AuraService SHALL être importable depuis `@/aura/server/service` (fichier `src/aura/server/service.ts`).

### Requirement 2: Service pattern pour les operations

**User Story:** En tant que développeur, je veux que mes operations soient des thin handlers qui instancient un Service et délèguent, pour que la logique métier soit testable et réutilisable.

#### Acceptance Criteria

1. Le handler d'operation PEUT instancier un Service avec `new MonService(ctx)` et appeler une méthode.
2. Le handler d'operation PEUT continuer à utiliser `ctx.db.*` directement (backward compat).
3. Un Service PEUT appeler d'autres Services via leur constructeur (composition).
4. Un Service PEUT utiliser `this.runQuery/runMutation/runAction` pour appeler d'autres operations de manière typée.
5. Un Service utilisant `.action()` NE DOIT PAS accéder à `this.db` (le Proxy tombstoné du runner le bloque — le service doit utiliser `this.runQuery/runMutation` à la place).

### Requirement 3: Fix operationAsTool

**User Story:** En tant que développeur utilisant des agents IA, je veux que les outils LLM appellent les operations avec le contexte de l'appelant, pour que `ctx.user` et `ctx.session` soient disponibles et que les operations `.auth()` ne throw pas `UNAUTHORIZED`.

#### Acceptance Criteria

1. `operationAsTool` SHALL capturer le contexte courant via une closure au moment de la définition de l'outil.
2. IF le service/appelant fournit un contexte explicite, THEN `operationAsTool` SHALL l'utiliser.
3. IF aucun contexte n'est disponible, THEN `operationAsTool` SHALL créer un contexte frais (fallback).
4. `operationAsTool` SHALL utiliser `ctx.runQuery/runMutation/runAction` selon le `_type` de l'operation plutôt que `op.execute(...)`.
