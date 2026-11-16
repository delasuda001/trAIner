# trAIner

Coach de course à pied personnel, local, branché sur la montre Garmin.

- **Source** : Garmin Connect Personal API (clé personnelle, accès en lecture seule).
  Activités, fichiers FIT (séries seconde par seconde et laps), VFC, sommeil, FC de repos,
  VO2max, zones FC et seuil mesurés par la montre.
- **Stockage** : SQLite local (`data/run-insights.db`). Le tableau de bord se charge
  instantanément et fonctionne hors ligne ; la synchro est incrémentale.
- **Analyse** : un moteur déterministe calcule tous les chiffres (type de séance, séances
  comparables, écarts à FC égale, dérive, ralentissement, charge, récupération, progression,
  prochaine séance).
- **Coach** : Claude, via l'abonnement claude.ai déjà connecté au CLI `claude` (SDK Agent),
  sans clé API. Claude ne reçoit qu'un résumé chiffré compact (~1 300 tokens par séance),
  jamais les séries brutes ni le GPS, et chaque chiffre de sa réponse est vérifié contre ce
  résumé. Les analyses sont mises en cache ; Claude n'est jamais appelé au chargement d'une page.

## Démarrage

Prérequis : Node 24 (`.nvmrc`), et le CLI Claude Code installé et connecté une fois
(`claude` dans un terminal, puis se connecter avec son compte claude.ai).

```bash
npm install
cp .env.example .env.local   # puis renseigner GARMIN_API_KEY
npm run build
npm start
```

Ouvrir http://localhost:3000. Au premier lancement, la synchro importe tout l'historique
Garmin (quelques minutes pour les séries détaillées des courses, par lots de 40) ; la page
se met à jour au fur et à mesure. Ensuite, la synchro tourne au chargement si la précédente
date de plus de 15 minutes, et à la demande via le bouton « Synchroniser ».

Pour développer : `npm run dev`. Contrôles : `npm run check` (lint + types + tests).

## Objectif

La page **Objectif** (course visée, date, temps, sorties par semaine, jours possibles) est facultative ; la suggestion et le coach s'en servent quand elle est remplie. Thème sombre par défaut, clair via le bouton en haut à droite.

## Variables (`.env.local`)

| Variable | Rôle |
|---|---|
| `GARMIN_API_KEY` | Clé Garmin Connect Personal API, créée sur https://connect.garmin.com/app/settings/personalApiToken (expire selon la durée choisie à la création). |
| `CLAUDE_COACH_MODEL` | `sonnet` (défaut, économe sur le quota), `opus` ou `haiku`. |
| `DATABASE_URL` | `file:./data/run-insights.db` par défaut. |

Les migrations SQLite s'appliquent automatiquement au démarrage.

## Quand Claude est-il appelé ?

- Après une synchro qui ramène une nouvelle course : analyse de cette course et avis sur la
  prochaine séance (2 appels).
- Sur demande : boutons « Demander l'analyse du coach » / « Demander l'avis du coach ».
- Jamais au chargement. Une analyse déjà faite sur les mêmes données est relue depuis le cache.
- Si Claude est indisponible ou que le quota Pro est atteint, l'analyse chiffrée du moteur
  reste affichée.

## Arborescence utile

```
src/lib/source/        interface DataSource + adaptateur Garmin (seul module à changer pour une autre source)
src/lib/sync/          synchro incrémentale vers SQLite
src/lib/engine/        moteur déterministe (métriques, comparables, verdict, charge, récupération, progression, suggestion)
src/lib/coach/         client LLM (interface étroite), prompts, charges utiles, garde-fou des chiffres
src/lib/server/        services serveur (analyses, cache des sorties du coach)
src/app/               pages (tableau de bord, séance) et routes API
```
