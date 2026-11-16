# ADR-008 : Garmin Connect Personal API comme source

Statut : accepté (novembre 2026). Remplace ADR-002 (intervals.icu comme source de vérité).

## Contexte
Garmin a ouvert en octobre 2026 une API personnelle : une clé créée par l'utilisateur dans
Garmin Connect s'échange contre un jeton d'accès de 24 h (en-tête `Authorization: ApiKey …`,
puis `Bearer`). Lecture seule : activités, fichiers FIT, VFC, sommeil, résumés quotidiens,
VO2max, zones FC. L'historique remonte à 2022, contre août 2025 via intervals.icu.

## Décision
- Source unique : Garmin, derrière l'interface `DataSource` (`src/lib/source/types.ts`).
  Changer de source ne touche que l'adaptateur.
- Séries détaillées : fichier FIT d'origine, téléchargé une fois pour chaque course et stocké
  localement ; les autres sports restent en résumé.
- L'intégration intervals.icu et la route non officielle de connexion Garmin ne sont pas utilisées.

## Conséquences
- La clé expire (30 j à 1 an) : il faudra la recréer et mettre à jour `.env.local`.
- Fenêtres de dates limitées par l'API (31 j pour le sommeil) : la synchro découpe les plages.
