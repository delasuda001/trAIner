
# Architecture

## Vue d'ensemble

Garmin alimente Intervals.icu.
L'application Run Insights lit Intervals.icu via des routes serveur Next.js.
Les calculs sont réalisés localement.
Gemini reçoit uniquement des données agrégées et non géolocalisées.
SQLite conserve les données propres à l'application.

## Composants

- Frontend Next.js
- Routes API serveur Next.js
- Client Intervals.icu côté serveur
- Moteur de calcul métier
- Base SQLite via Drizzle
- Client Gemini côté serveur
- Composants graphiques Recharts

## Flux de données

Navigateur -> Route serveur Next.js -> API Intervals.icu
Route serveur -> Moteur de métriques -> SQLite
Route serveur -> Gemini avec résumé agrégé
Gemini -> Réponse JSON validée -> SQLite -> Navigateur

## Principe de source de vérité

- Activités brutes : Intervals.icu
- Notes, analyses, actions, préférences : SQLite
- Cache local : optionnel et ciblé
