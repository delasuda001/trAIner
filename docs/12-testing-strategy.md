# Stratégie de tests

Les tests Vitest des repositories utilisent une base `better-sqlite3` en mémoire.
Ils appliquent la migration SQL générée avant chaque suite et ne touchent jamais
`data/run-insights.db`.

La suite couvre les contraintes uniques, l'upsert des activités synchronisées,
la validation des séances manuelles, les confirmations, les payloads JSON et les
transactions garantissant un contexte actif et un objectif principal actif.

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

Les routes contexte/objectifs sont testées sur SQLite mémoire pour le contexte
vide, la validation V1, l'archivage transactionnel des versions, le remplacement
du primary actif, les mises à jour partielles, le tri et l'archivage non destructif.
