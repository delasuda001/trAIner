# Modèle SQLite local

## Base

La base de développement est `data/run-insights.db`, configurée par
`DATABASE_URL=file:./data/run-insights.db`. Elle est servie par Drizzle ORM et
`better-sqlite3`. Les fichiers SQLite et journaux sont ignorés par Git.

## Tables

Le schéma comprend `synced_activities`, `activity_details_cache`,
`activity_stream_summaries`, `manual_sessions`, `user_confirmations`,
`athlete_context_versions` et `goals`.

`synced_activities` est réservé aux activités de course importées d'Intervals.icu.
L'identifiant externe `intervals_activity_id` est unique. Les activités manuelles
ne sont jamais insérées dans cette table.

`activity_details_cache` peut contenir les métadonnées et intervalles validés,
mais jamais de streams bruts, latitude, longitude, polyline ou trace GPS.
`activity_stream_summaries` est réservé à de futurs résumés dérivés, sans données
brutes de localisation.

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