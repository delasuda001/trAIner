
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

## Optimisation

- Ne pas récupérer les streams de toutes les activités.
- Mettre en cache les métadonnées.
- Prévoir une gestion d'erreur pour les réponses 429.
- Prévoir un délai de nouvelle tentative respectant Retry-After.
- Ne pas dépendre d'un schéma de réponse non validé.

## Documentation de référence

https://intervals.icu/api-docs.html
