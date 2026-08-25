# ADR-003 : SQLite local avec Drizzle

## Contexte

Run Insights est une application personnelle locale. Le premier socle doit
persister des données sans dépendance à un service distant.

## Décision

Utiliser SQLite dans `data/run-insights.db`, accéder à la base avec Drizzle ORM
et `better-sqlite3`, et versionner les migrations SQL dans `drizzle/`.
Les repositories reçoivent une instance DB injectable pour les tests mémoire.

## Conséquences

La configuration reste simple et les tests sont reproductibles. Les données sont
locales et exclues de Git. Les timestamps techniques sont en ISO 8601 UTC ; les
dates de calendrier manuel restent en `YYYY-MM-DD`. Une migration ultérieure vers
PostgreSQL devra préserver les repositories et contrats métier.

## Alternatives écartées

Une base distante et un ORM différent ont été écartés pour ce jalon local. Aucun
driver SQLite alternatif n'est ajouté tant que `better-sqlite3` fonctionne avec
Node.js 24.15.0.
