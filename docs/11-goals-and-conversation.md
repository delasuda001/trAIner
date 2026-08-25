# Objectifs et conversation future

Les objectifs sont des entités structurées dans `goals`, avec une priorité,
un statut, une période et une définition JSON validée. Le repository garantit
qu'un seul objectif `primary` peut être `active`; lorsqu'un nouveau primary
actif est créé, l'ancien devient `secondary` et `paused`.

Le contexte athlète est versionné dans `athlete_context_versions`. La page
Mon contexte crée et active une nouvelle version au lieu de muter l'historique.

La conversation guidée par les données est hors périmètre de l'étape SQLite.
Aucun appel Gemini ou autre LLM n'est créé ici. Lorsqu'elle sera implémentée,
elle ne recevra par défaut que des activités de course issues de
`synced_activities`, jamais `manual_sessions`.
