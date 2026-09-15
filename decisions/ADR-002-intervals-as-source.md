# ADR-002 : Intervals.icu comme source de vérité des activités

> Contenu reconstitué a posteriori le 2026-09-09 : le fichier était vide depuis
> l'origine. La décision est en vigueur et visible dans `AGENTS.md`, `docs/03`,
> `docs/05`, `docs/17` et le code `src/lib/intervals/` ; seule la rédaction du
> raisonnement est reconstituée.

## Contexte

Les activités de course proviennent de montres Garmin. Garmin alimente déjà
Intervals.icu, qui expose une API HTTP documentée (activités, détail,
intervalles, streams) avec une clé et un identifiant athlète. L'application a
besoin d'une source d'activités fiable sans réimplémenter l'ingestion Garmin ni
le parsing de fichiers FIT.

## Décision

**Intervals.icu est l'unique source de vérité des activités.** L'application
lit Intervals.icu via des Route Handlers serveur Next.js (clé
`INTERVALS_API_KEY` et `INTERVALS_ATHLETE_ID` lues côté serveur uniquement),
valide chaque réponse avec Zod, et ne conserve en local qu'un cache de travail
(`synced_activities`, `activity_details_cache`) synchronisé manuellement. Aucune
écriture n'est renvoyée vers Intervals.icu.

## Conséquences

- La synchronisation est déclenchée par l'utilisateur ; pas de cron ni de
  webhook. Les activités locales ne sont jamais supprimées automatiquement.
- Seules les activités de type `Run` normalisées sont mappées ; le reste est
  ignoré.
- Les streams bruts et les coordonnées GPS ne sont jamais persistés (cf.
  ADR-004, `docs/08`).
- Une future source directe (API Garmin) reste possible : le calcul local des
  seuils/zones ne dépend d'aucun champ propriétaire Intervals.icu (`docs/22`).
- Les séances non-course saisies à la main sont hors de ce périmètre et vivent
  dans `manual_sessions` (cf. ADR-006).

## Alternatives écartées

- **Connexion directe à Garmin Connect** : pas d'API publique stable, coût
  d'intégration disproportionné pour un usage personnel (non-objectif MVP,
  `docs/00`).
- **Import manuel de fichiers FIT** : parsing binaire à maintenir, friction à
  chaque activité (non-objectif MVP).
- **SQLite comme source de vérité** : ferait diverger l'historique local de la
  plateforme de référence et compliquerait la reprise après perte de la base.
