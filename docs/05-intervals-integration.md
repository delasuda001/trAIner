
# Intégration Intervals.icu

## Objectif

Intervals.icu est la source des activités sportives Garmin.

## Sécurité

- Appels seulement côté serveur.
- Clé API lue depuis INTERVALS_API_KEY.
- Identifiant athlète lu depuis INTERVALS_ATHLETE_ID.
- Aucun secret exposé au navigateur.
- Les réponses API sont validées avec Zod.

## Cas d'usage

- Lister les activités récentes.
- Charger le détail d'une activité.
- Charger les streams uniquement pour l'activité consultée.
- Charger les données wellness dans une phase ultérieure.

La synchronisation manuelle utilise `GET /api/v1/athlete/{id}/activities` avec
`oldest` et `newest` au format `YYYY-MM-DD`. Les bornes sont traitées comme
inclusives par le service local. La période par défaut est de 12 semaines et peut
être bornée entre 1 et 52 semaines.

Les activités sont validées individuellement puis seules les activités de type
`Run` sont mappées vers `synced_activities`. Les autres types observés sont
ignorés. `manual_sessions` n'est jamais lu ni écrit par cette intégration.

## Optimisation

- Ne pas récupérer les streams de toutes les activités.
- Mettre en cache les métadonnées.
- Prévoir une gestion d'erreur pour les réponses 429.
- Prévoir un délai de nouvelle tentative respectant Retry-After.
- Ne pas dépendre d'un schéma de réponse non validé.

## Documentation de référence

https://intervals.icu/api-docs.html
