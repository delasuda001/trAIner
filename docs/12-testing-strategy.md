# Stratégie de tests

## Base de test et migrations

Toute suite Vitest qui a besoin d'une base utilise `better-sqlite3` en mémoire
(`:memory:`) et ne touche jamais `data/run-insights.db`.

Règle unique : une suite qui monte une base **applique toutes les migrations
réelles** `drizzle/*.sql` via `applyMigrations`
(`src/lib/db/testing/apply-migrations.ts`), dans l'ordre. Interdits :

- réécrire un `CREATE TABLE` à la main dans un fichier de test (le DDL dérive
  en silence du schéma réel) ;
- n'appliquer qu'un sous-ensemble des fichiers de migration, ou les énumérer
  un par un dans la suite (ajouter une migration obligerait alors à modifier
  chaque fichier de test — c'est ainsi que `0001` a été oubliée par plusieurs
  suites).

`applyMigrations` lit le dossier `drizzle/` à l'exécution : ajouter une
migration ne demande aucune modification des tests.

Suites concernées aujourd'hui : `repositories.test.ts`, `context-goals.test.ts`,
`manual-sessions/route.test.ts`, `activities/route.test.ts`,
`activities/[id]/route.test.ts`, `activities/[id]/context/route.test.ts`,
`activities/[id]/streams/route.test.ts`, `sync/activities/route.test.ts`,
`performance-profile/recalculate/route.test.ts`,
`analysis/performance-profile.test.ts`, `analysis/threshold-basis.test.ts`,
`llm/context.test.ts`, `intervals/sync.test.ts`, `dashboard/dashboard.test.ts`.

La suite repository couvre les contraintes uniques, l'upsert des activités
synchronisées, la validation des séances manuelles, les confirmations, l'upsert
du contexte d'activité (création, relecture par `intervals_activity_id`, mise à
jour sans doublon avec préservation de `id`/`created_at`, suppression), l'upsert
d'un résumé de streams par `(activité, stream_version)`, la relecture d'une
analyse persistée dans un ancien format (`parseStoredAnalysis`, y compris le
strip de `questions_to_consider`), la persistance de `model` et `prompt_version`
sur le message `assistant` d'une conversation, les payloads JSON et les
transactions garantissant un contexte actif et un objectif principal actif.

Le format de sortie du débrief (`schemas.test.ts`) : contrat `1.2` sans
`questions_to_consider`, bornes `key_takeaways` (1–3), compat ascendante par
strip, et `performanceProfileSchema`.

Le calcul de résumé de streams (`analysis/stream-summary.test.ts`) : meilleur
effort par durée de référence, fenêtres courtes plus rapides que les longues,
absence de série brute et de donnée de localisation dans le payload, gestion des
activités trop courtes et de l'absence de FC/distance.

Le profil de performance (`analysis/performance-profile.test.ts`) : agrégation
du meilleur effort par durée sur plusieurs activités, date de l'activité source
sur chaque effort retenu, `key_takeaways` des débriefs récents, comptages,
profil vide cohérent, exclusion des résumés d'une autre version de format et
des résumés hors fenêtre de 20 semaines (comptés au total, pas dans la
fenêtre).

L'agrégation partagée (`analysis/threshold-basis.test.ts`) : traçabilité de la
date source, exclusion des résumés hors fenêtre `ESTIMATE_WINDOW_WEEKS` même
plus rapides, `freshnessAlert` levé si aucun point retenu n'a moins de
8 semaines et non levé sinon.

`llm/context.test.ts` couvre en plus : le `thresholdEstimate` du débrief
alimenté par les résumés en cache dans la fenêtre (confiance ≠ `insufficient`,
`criticalSpeedMps` non nul) et le maintien de la confiance `insufficient` sans
résumé en cache.

La route `POST /api/performance-profile/recalculate` : rejet hors bornes
`weeks`, fenêtre bornée (activités hors période non appelées), activités déjà
résumées sautées, séquentiel, arrêt immédiat sur 429 avec `Retry-After` remonté
sans relance.

La migration de production est vérifiée séparément avec `npm run db:migrate` sur
la base locale. Cette séparation évite qu'un test automatisé ne modifie la base
de développement tout en testant effectivement le SQL généré dans une base
temporaire.

Les tests de synchronisation mockent `fetch` et utilisent la même base mémoire.
Ils couvrent les bornes `weeks`, le mapping des types `Run`, l'idempotence, les
modifications, les activités invalides isolées, les réponses globales invalides,
les erreurs réseau et le statut 429. Les tests de route de liste vérifient que
seul `synced_activities` est lu, avec filtres de dates et limite.

Les routes manuelles sont testées avec une base mémoire séparée : création,
réponse vide, validation de date, discipline et durée, limites de texte, filtre
de période, PATCH partiel, conservation de `created_at`, suppression et 404.

Les routes contexte athlète/objectifs sont testées sur SQLite mémoire pour le
contexte vide, la validation V1, l'archivage transactionnel des versions, le
remplacement du primary actif, les mises à jour partielles, le tri et
l'archivage non destructif.

La route `POST/GET /api/activities/[id]/context` (ressenti et note par activité)
est testée à part (`activities/[id]/context/route.test.ts`, `getDb` remplacé par
la base mémoire via `vi.spyOn`) : enregistrement valide et relecture, conversion
des drapeaux booléens en `0/1`, upsert sans doublon, identifiant d'activité
invalide, et rejet des corps invalides (`perceivedExertion` > 100,
`note` > 2000, drapeaux non booléens, champ requis manquant) sans écriture.

La route `GET /api/activities/[id]/analysis` (`activities/[id]/analysis/route.test.ts`)
vérifie que le sous-ensemble `thresholdEstimate` (provenance, confiance,
`staleWarning`, `retainedPoints`, fenêtre) est relu depuis
`deterministic_metrics_json`, qu'une analyse ancienne sans bloc seuil renvoie
`thresholdEstimate: null`, et le 404 sans analyse.

## Composants React (.tsx) : logique d'affichage extraite et testée, composants non testés

**Convention du projet, assumée.** Le projet n'embarque pas
`@testing-library/react` et les composants `.tsx` (`activity-detail.tsx` et son
`AnalysisPanel` / `ThresholdProvenance`, `components/context/*`,
`assistant/page.tsx`, `dashboard/*`) **ne sont pas rendus dans des tests**. En
contrepartie :

- **toute décision d'affichage non triviale est extraite en fonction pure**
  dans `src/lib/**` et testée avec Vitest. Le composant se contente d'appeler
  la fonction et de câbler le JSX. Exemple de référence :
  `analysis/confidence-banner.ts` (`selectConfidenceBannerState`,
  `isAlarmingBanner`, `showsStalenessNote`, `buildThresholdStaleMessage`)
  consommé à la fois par `ThresholdProvenance` et `PerformanceProfilePanel`,
  testé par `confidence-banner.test.ts` (dont les cas limites, y compris
  « confiance bonne + ancrage périmé ») ;
- la couverture repose donc sur les tests de `src/lib/**` (calculs,
  agrégations, schémas Zod, **logique d'affichage extraite**) et sur les tests
  de routes API (`src/app/api/**`), qui valident les charges utiles.

Dupliquer des conditions dans le JSX de deux composants au lieu de passer par
une fonction pure partagée est considéré comme une régression de cette
convention.

**À revoir** si un composant accumule un état multi-étapes complexe qu'aucune
fonction pure ne capture proprement : introduire alors
`@testing-library/react` et couvrir en priorité `AnalysisPanel` /
`ThresholdProvenance` et `PerformanceProfilePanel`.
