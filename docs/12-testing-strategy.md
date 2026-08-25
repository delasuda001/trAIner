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
