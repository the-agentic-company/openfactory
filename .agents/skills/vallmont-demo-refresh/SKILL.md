---
name: vallmont-demo-refresh
description: Rafraîchit la démonstration « Étude Vallmont · Démo » (workspace synthétique de mibba.co) après une évolution du produit. Relit les nouveautés (commits, PRD, PR ouvertes, agents du vault), étend le catalogue de données de démo pour les couvrir, valide contre les contrats de production, provisionne en local, vérifie dans le navigateur, puis prépare la PR et l'application en prod. À utiliser quand on dit « mettre à jour la démo », « rafraîchir Vallmont », « ajouter de la mock data pour la démo », « la démo ne montre pas la nouvelle fonctionnalité », « préparer la démo avant un rendez-vous ».
---

# Rafraîchir la démo Vallmont

Vallmont est un workspace **synthétique** : ses lignes viennent d'un catalogue en clair, ses
agents sont simulés par un script par dossier, et rien n'appelle un modèle ni un service
externe. Rafraîchir la démo, c'est **étendre le catalogue**, jamais patcher la base à la main.

Lire d'abord `docs/prd/unified-production-ui-and-synthetic-demo-execution.md` (le contrat de la
démo) si c'est la première fois.

## Où vit quoi

| Surface de la démo | Fichier | Ce qu'on y ajoute |
| --- | --- | --- |
| Collaborateurs de l'étude | `apps/web/src/server/demo-workspace/catalog-staff.ts` | un notaire, un clerc, un service |
| Dossiers, pièces, parties, biens, courrier **et scénario des agents** | `catalog-dossiers-immobilier.ts`, `catalog-dossiers-immobilier-risques.ts` (ventes qui se passent mal : rétractations multiples, prêt refusé, état daté périmé, avant-contrat absent), `catalog-dossiers-famille.ts` | un dossier par situation métier ; `script` = ce que publient contextualisation / analyse / pré-visa ; `seedOperations` = ce qui est déjà joué au provisionnement |
| Répertoire clients (identité) | `catalog-clients.ts` + `DEMO_CLIENT_KEYS` dans `apps/web/src/lib/demo-workspace.ts` | une fiche par client, rattachée à un dossier par `client("…", clientKey, …)` |
| Fiche client détaillée (patrimoine, entourage, points d'attention) | `apps/web/src/lib/demo-client-detail-extra.ts` | une entrée `demo-party-<clé>` par client |
| Fiche client : brief, frise d’activité, échanges, organigramme (liens de famille, parts de chacun) | `apps/web/src/lib/demo-client-stories.ts` | une histoire par client : `activities`, `interactions`, `parents`, `holders` |
| Fils de mails des dossiers (onglet Mail du dossier et de la fiche client) | `apps/web/src/server/demo-workspace/catalog-mail-threads.ts` | un échange avec son corps (`body`) |
| État hypothécaire et origine trentenaire | `apps/web/src/server/demo-workspace/catalog-title-origins.ts` | la publication de l’agent `title_origin`, pièces désignées par leur clé ; `seedOperations: ["title_origin"]` pour la montrer déjà faite |
| Complément Outlook (courriers reçus dans une vraie boîte) | `apps/web/src/server/demo-workspace/outlook-scenarios.ts`, guide `docs/demo/outlook-vallmont.md` | un scénario reconnu par son objet ; les autres courriers sont triés par `outlook-triage.ts` |
| Boîte de réception simulée + agenda | `catalog-mail.ts` | un message avec `context` (dossier, client, pièces jointes, réponse suggérée) ; un événement |
| Conversations de l'assistant déjà menées | `catalog-conversations.ts` | un échange par sujet de démonstration |
| Réponses de l'assistant en direct (par mots-clés) | `apps/web/src/server/services/demo-assistant-simulation.ts` | une règle `[regex, réponse]` |
| Opportunités (fixtures front, tous workspaces) | `apps/web/src/lib/opportunity-fixtures.ts` | une opportunité liée à un client Vallmont |
| Contrat du script et résolution des pièces | `packages/core/src/server/services/demo-dossier-script.ts` | une nouvelle section quand un **nouvel outil d'écriture** apparaît |
| Rejeu du script | `packages/core/src/server/services/demo-dossier-simulation.ts` | l'appel à la nouvelle écriture |
| Contenu des pièces (PDF affiché dans l'aperçu, passages cités surlignés) | `apps/web/src/server/demo-workspace/document-content.ts` (spécification depuis le script) + `packages/core/src/server/services/demo-document-pdf.ts` (rendu) | rien à faire : le PDF suit l'analyse et les citations du script ; bumper `DEMO_DOCUMENT_PDF_VERSION` si le rendu change |
| Journal (dates des rejeux, décisions de l'étude, relances envoyées) | `seedTimeline`, `decisions[]`, `followUps[]` sur le dossier ; projection dans `demo-workspace/journal.ts` | une décision (`validate` / `resolve` / `dismiss` sur une clé du script) ou une relance (`reminderKey` du script) |
| Provisionnement (upsert idempotent, retrait des lignes obsolètes) | `apps/web/src/server/demo-workspace.ts` | une nouvelle table à projeter |
| Version du catalogue | `DEMO_FIXTURE_CATALOG_VERSION` dans `catalog.ts` | **à bumper à chaque changement de contenu** |

Les identifiants de base sont dérivés des clés (`ids` dans `catalog.ts`). Renommer une clé crée
une nouvelle ligne et retire l'ancienne à la synchronisation suivante : c'est voulu.

## 1. Inventorier ce qui a changé

Partir de la date encodée dans `DEMO_FIXTURE_CATALOG_VERSION` (`vallmont-AAAA-MM-JJ.n`) :

```sh
git log --since=<date> --oneline -- apps/web/src packages/core/src packages/db/src
ls -t docs/prd | head            # PRD récents
gh pr list --state open          # ce qui va arriver
ls obsidian/obsidian-mibba-prod/agents/   # agents en prod (lecture seule, ne jamais éditer)
```

Pour chaque nouveauté, répondre à trois questions et noter la réponse dans le plan :

1. **Quelle surface l'utilisateur voit-il ?** (onglet de dossier, page Clients, boîte, agenda,
   assistant, opportunités, notifications…)
2. **Quelle donnée la nourrit ?** Chercher le routeur oRPC (`apps/web/src/server/orpc/routers`)
   puis le read-model (`packages/core/src/server/…`). Si c'est une écriture d'agent, lire son
   schéma zod dans `dossier-intelligence/contracts.ts` ou `formality-controls.ts` : c'est
   exactement ce que le script doit produire.
3. **Est-ce couvert par un dossier existant ?** Un dossier par situation métier : il faut au
   moins un dossier qui *montre* la fonctionnalité déjà faite (`seedOperations`) et un où on
   peut la *lancer en direct* (script présent, opération non jouée).

Exemples de correspondance déjà en place : pré-visa (`#250`) → `script.preVisa` +
`seedOperations: ["pre_visa"]` sur 1032048 et 1032051, script seul sur 1032057 (VEFA) pour
le lancer en démo ; rapprochement de courrier → `emails[]` avec `inboxMessageKey` pour qu'un
message de la boîte porte sa colonne « Dossier ».

Un agent du vault prod sans équivalent dans le script (ex. `regime-trentenaire`) signifie qu'un
nouvel outil d'écriture arrive : attendre que son contrat existe dans `packages/core`, puis
ajouter la section correspondante au script (`demo-dossier-script.ts`), au rejeu
(`demo-dossier-simulation.ts`) et à la validation (`catalog.ts`).

## 2. Étendre le catalogue

Règles à respecter, dans l'ordre où elles cassent le plus souvent :

- **Chaque ligne « present » d'une checklist cite une pièce du dossier** (`documentKeys`) ;
  une pièce citée mais absente est signalée par la validation. Une ligne `missing` n'en a pas.
- **Les jalons sont ordonnés** : `completed…`, puis **une seule** étape `current` ou `blocked`,
  puis `upcoming…` — ou toutes `completed` pour un dossier terminé.
- **Les dates sont relatives** (`dateInDays`, `dueInDays`, `ageDays`, `hoursAgo`) : la démo
  reste fraîche à chaque provisionnement.
- **Un pré-visa suit le prompt de l'agent** (`obsidian/…/agents/pre-visa/prompt.md`) : sept
  phases, clés `pre_visa_<rubrique>_<controle>`, statuts
  `ok / warning / review / blocked / uncontrollable` (`uncontrollable` = pièce absente ou
  référentiel indisponible, une limite de Mibba et non un défaut de l'acte),
  `suggestion` formulée comme une question, preuve = pièce + page.
- **Chaque constat de pré-visa porte sa place dans l'acte** : `section` (une clé de
  `formalityActSections` dans `packages/core/src/lib/formality-act-sections.ts`) et `actPage`
  (page de l'acte, ≥ 1). L'onglet Contrôles trie dessus pour que le juriste corrige de haut en
  bas ; sans `section`, la rubrique est devinée depuis la clé et le constat tombe en fin de
  liste. Répartir les constats sur plusieurs rubriques pour que la démo montre le tri.
- **Le statut de la colonne « Pré-visa » est dérivé, jamais saisi** : `Non lancé` sans révision
  publiée, `Bloqué` s'il reste un bloquant non traité, `À vérifier` s'il reste un autre point non
  traité (`uncontrollable` compris), `Prêt` sinon. Pour montrer les quatre dans la grille, il
  suffit de doser les statuts des constats — voir `formality-status.ts`.
- **Un client n'existe que rattaché à un dossier** ; sa clé est dans `DEMO_CLIENT_KEYS` (lib),
  dans `catalog-clients.ts` (identité) et dans `demo-client-detail-extra.ts` (fiche).
- **La grille des dossiers se lit comme celle d'une vraie étude** : `typeCode` est un code Septeo
  (`caseTypes` de `lib/case-metadata.ts`), `statusLabel` un état Septeo (`En cours`, `En attente`,
  `Suspendu`, `Clôturé`), `department` un service en majuscules (`caseServices`), `provision` la
  provision sur frais affichée en « Montant prévisionnel » ; la référence affichée est `103` +
  les quatre chiffres de la clé (`septeoReference`).
- **Les données sont fausses mais plausibles** : adresses du 11e et de l'est parisien, montants
  cohérents entre promesse, offre de prêt et acte, noms qui n'existent pas.
- Garder la diversité : dossiers contextualisés / vierges, complets / tout juste ouverts,
  bloqués / signés, avec et sans courrier.
- Bumper `DEMO_FIXTURE_CATALOG_VERSION` (date du jour, suffixe `.1`, `.2`…).

## 3. Valider

```sh
cd apps/web && bunx vitest run src/server/demo-workspace.test.ts   # catalogue vs contrats de prod
cd packages/core && bunx vitest run src/server/services/demo-dossier-script.test.ts
bun run check            # tsc sur tout le monorepo
bunx oxlint <fichiers>   # puis bunx oxfmt --write <fichiers>
```

Le premier test exécute `validateInternalDemoFixtureCatalog()` : il résout chaque script avec
les pièces du dossier et le passe dans les schémas réels des outils. Un message d'erreur cite
le dossier (`1032048 : checklist refusé par le contrat de production — …`) : corriger le
catalogue, jamais le schéma.

## 4. Provisionner en local et vérifier

La recette locale est dans `CLAUDE.local.md` §4 (Docker, `db:push`, publication du vault dev
dans MinIO, `vite --port 3100`). Puis, l'environnement exporté :

```sh
cd apps/web
bun scripts/provision-demo-workspace.ts --email=<email interne>          # dry run : plan par entité
bun scripts/provision-demo-workspace.ts --email=<email interne> --apply  # écrit + rejoue les opérations
```

L'email interne doit appartenir à un utilisateur **existant** en base (se connecter une fois, ou
créer le compte QA avec un email `@theagenticcompany.ai`). Le rejeu a besoin du catalogue
d'agents (vault publié) : sans lui, la synchronisation des lignes passe mais `replay` échoue —
relancer après publication, la clé d'idempotence est versionnée.

Vérifier ensuite avec `/browse` (jamais les outils Chrome MCP), en se connectant avec ce compte
et en basculant sur « Étude Vallmont · Démo » :

- `/cases` : les 20 dossiers ; ouvrir 1032048 (Aperçu, Documents, Contrôles, Journal), 1032056
  (vide), 1032062 (checklist proposée à accepter), 1032064 (huit échéances, « Afficher tout »),
  1032066 (financement refusé, étape bloquée), 1032067 (trois bloquants au pré-visa),
  1032065 (constitution presque vide).
- Lancer « Contextualiser » sur 1032050 ou 1032060 et « Lancer les contrôles » sur 1032057 : la
  simulation doit publier le script en ~1 s, rafraîchissement compris.
- `/clients` : ouvrir une fiche nouvelle (patrimoine, points d'attention).
- `/mail` : les relances prêtes à envoyer ; un message de la boîte s’ouvre par `/mail/demo-mail-<clé>`
  (dossier rattaché, pièces jointes proposées, réponse suggérée).
- `/assistant` : conversations épinglées ; poser une question sur un dossier nommé.
- `/opportunities` : les nouvelles opportunités.

Capturer une capture par surface changée pour la PR.

## 5. Livrer

1. `/ship` — la PR décrit ce que la démo montre de nouveau, avec les captures. Ne pas committer
   `bun.lock`, `apps/web/src/routeTree.gen.ts`, ni les fichiers modifiés par d'autres sessions.
2. Après merge et déploiement, appliquer en prod **depuis un poste avec Tailscale et l'env prod
   exporté** (`infisical export --env prod`, `DATABASE_URL=$DATABASE_URL_PROD`,
   `NODE_ENV=production`) :

```sh
cd apps/web
bun scripts/provision-demo-workspace.ts --email=<email interne>                 # dry run, relire le plan
bun scripts/provision-demo-workspace.ts --email=<email interne> --apply --confirm-production=ETUDE-VALLMONT
```

Le rapport JSON donne `plan` (créations / mises à jour / retraits par entité), `operations`
(rejeux, `dispatched: false` = déjà joué pour cette version) et `rows` avant / après. Relire le
dry run avant d'appliquer : un retrait inattendu signale une clé renommée par erreur.

## Garde-fous

- Ne jamais éditer `obsidian/obsidian-mibba-prod/` ni la base prod à la main.
- Ne jamais mettre de données réelles (C&C Notaires ou autre client) dans le catalogue.
- Ne jamais faire de branche par identifiant de workspace dans l'UI : si une surface a besoin
  d'un cas particulier pour Vallmont, c'est la donnée qui doit changer, pas le composant.
