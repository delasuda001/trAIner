# Modèle SQLite local

## Base

La base de développement est `data/run-insights.db`, configurée par
`DATABASE_URL=file:./data/run-insights.db`. Elle est servie par Drizzle ORM et
`better-sqlite3`. Les fichiers SQLite et journaux sont ignorés par Git.

## Tables

Le schéma (`src/lib/db/schema.ts`, inventaire détaillé dans
`docs/04-data-model.md`) comprend `synced_activities`,
`activity_details_cache`, `activity_stream_summaries`, `manual_sessions`,
`user_confirmations`, `athlete_context_versions`, `goals`,
`activity_contexts`, `analyses`, `action_items`, `conversation_threads` et
`conversation_messages`.

Les migrations Drizzle correspondantes sont `drizzle/0000_previous_marrow.sql`
(sept premières tables), `drizzle/0001_vengeful_sunfire.sql`
(`activity_contexts`, `analyses`, `action_items`),
`drizzle/0002_boring_speed_demon.sql` (`conversation_threads`,
`conversation_messages`), `drizzle/0003_careless_grey_gargoyle.sql`
(`conversation_messages.prompt_version`) et `drizzle/0004_bright_husk.sql`
(`conversation_messages.model`).

Toute suite de tests qui monte une base SQLite mémoire applique **toutes** les
migrations `drizzle/*.sql` via `applyMigrations`
(`src/lib/db/testing/apply-migrations.ts`), jamais un `CREATE TABLE` réécrit à
la main ni une liste de fichiers énumérée à la main : ajouter une migration ne
doit plus jamais obliger à toucher un fichier de test.

`activity_contexts` porte le ressenti et la note saisis pour une activité.
`analyses` conserve les métriques déterministes, la comparaison historique et
la réponse LLM (`llm_response_json`), avec `llm_model` et `prompt_version`.
`analyses.prompt_version` versionne le format de la réponse de débrief : une
analyse écrite sous un format antérieur est détectée et signalée « à
régénérer » à la lecture (`parseStoredAnalysis`). `action_items` rattache des
actions à une analyse. `conversation_threads` / `conversation_messages`
portent la conversation guidée ; sur les messages `assistant`,
`conversation_messages.model` trace le modèle utilisé et
`conversation_messages.prompt_version` (nullable) versionne le format de
réponse de la conversation, **indépendamment** de `analyses.llm_model` et
`analyses.prompt_version` (cf. `docs/07-llm-integration.md`).

`synced_activities` est réservé aux activités de course importées d'Intervals.icu.
L'identifiant externe `intervals_activity_id` est unique. Les activités manuelles
ne sont jamais insérées dans cette table.

`activity_details_cache` peut contenir les métadonnées et intervalles validés,
mais jamais de streams bruts, latitude, longitude, polyline ou trace GPS.
`activity_stream_summaries` conserve, par `(intervals_activity_id,
stream_version)` (upsert), un résumé **dérivé** des streams d'une activité :
meilleurs efforts glissants sur 180/300/600/1200/1800 s (allure + FC moyenne)
et un compteur d'échantillons. Aucune série brute, aucune donnée de
localisation. Écrit à l'ouverture de l'onglet Courbes et par le recalcul du
profil de performance (`stream-summary.ts`, `stream-summary-repository.ts`).
Lu — jamais écrit — par l'estimation de seuil du profil **et** du débrief
d'une activité, via `threshold-basis.ts` (fenêtre de 20 semaines, cf.
`docs/22`).

Le détail réutilise ce cache pendant 24 heures ; les streams n'y sont pas écrits.

`user_confirmations` contient uniquement des candidats et leur résolution explicite.
Une détection n'est jamais enregistrée comme vérité automatique.

## Dates et JSON

Les timestamps (`created_at`, `updated_at`, `synced_at`, `fetched_at`) sont en ISO
8601 UTC. `manual_sessions.session_date` est une date locale métier au format
exact `YYYY-MM-DD` afin qu'un changement de fuseau ne déplace pas une séance.

Les fonctions `serializeJson` et `parseJson` de `src/lib/db/contracts.ts` imposent
une validation Zod aux frontières JSON persistées.

## Identifiants et relations

Toutes les clés internes sont des chaînes générées par l'application. Les
confirmations gardent une référence textuelle vers une activité externe sans clé
étrangère SQLite, tant que la stratégie de suppression et synchronisation n'est
pas établie.

Les repositories sont séparés par responsabilité et injectables, ce qui permet
de tester chaque comportement avec une base SQLite mémoire.