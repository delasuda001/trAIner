# Passation — Sillage (ex trAIner)

Note tenue à jour à chaque étape commitée, pour qu'un nouveau fil reparte sans relire l'historique.
Dernière mise à jour : 16 novembre 2026.

## En deux phrases

Dashboard local de coaching course à pied pour Bastien (Toronto). Les données viennent de Garmin
(Personal API, clé dans `.env.local`, jamais affichée ni commitée), un moteur déterministe calcule
tout, et Claude (Agent SDK, abonnement claude.ai local, pas de clé API) ne fait que formuler à partir
d'une charge utile compacte.

Lancer : `npm run build && npm start` → http://localhost:3000. Contrôles : `npm run check`
(lint, tsc, vitest).

## Où vit quoi

| Domaine | Fichiers |
| --- | --- |
| Source Garmin, synchro | `src/lib/source/garmin/*`, `src/lib/sync`, `src/lib/server/sync-service.ts` |
| Base SQLite (Drizzle) | `src/lib/db/schema.ts`, `src/lib/db/repositories/*`, `data/run-insights.db` (ignoré par git) |
| Moteur (pur, testé) | `src/lib/engine/*` : `activity-metrics` (type de séance, répétitions, moitiés, dynamique), `comparable` (séances comparables, écarts à FC égale), `verdict`, `suggestion` (prochaine séance), `progression`, `load`, `recovery`, `zones`, `prescription` (consignes chiffrées, voir plus bas) |
| Assemblage serveur | `src/lib/server/analytics.ts` (contexte, `analyzeSession`, `getDashboard`), `coach-service.ts` (cache, garde-fou, 2 essais), `chat-service.ts`, `usage.ts` |
| Coach (prompts, charges utiles, schémas) | `src/lib/coach/session-coach.ts`, `outlook-coach.ts` (conseil du jour), `chat-coach.ts`, `number-guard.ts`, `claude-agent-client.ts`, `index.ts` (choix du modèle) |
| Objectif | `src/lib/goal/goal.ts` (stocké dans `app_state`, clé `athlete_goal`) |
| Pages | `src/app/page.tsx` (tableau de bord), `activities/[id]` (séance), `coach` (Demander au coach), `objectif`, `parametres` |
| Composants | `src/components/*` (vue séance, cartes du tableau de bord, chat, formulaires) |

## Décisions qui tiennent

- Claude ne reçoit jamais de flux bruts ni de GPS, seulement des synthèses formatées.
- Garde-fou `number-guard` : tout chiffre écrit par Claude doit figurer dans la charge utile (entiers
  1 à 12 tolérés) ; une FC suivie d'une zone fausse est rejetée. Conséquence : toute cible chiffrée
  que Claude doit citer est calculée par le moteur et placée dans la charge utile.
- Cache par empreinte (version de prompt + charge utile) dans `coach_outputs` : jamais d'appel au
  chargement d'une page, seulement sur bouton. Changer la version d'un prompt invalide le cache ;
  l'ancienne sortie reste affichée « à mettre à jour ».
- Chaque appel est tracé dans `coach_usage` (tokens renvoyés par le SDK) ; l'état du quota de
  l'abonnement (`rate_limit_event` du SDK) est gardé dans `app_state` (`claude_rate_limit`).
- Coût réel : environ 3 500 tokens d'entrée et 1 500 de sortie par appel (surcouche fixe du SDK).
  Pendant le développement, limiter les appels réels et les compter.
- Zones FC et seuil : ceux de la montre (profil Garmin dans `app_state`, clé `athlete_profile`).
- Frontière médicale stricte (pas de blessure, fatigue globale, diagnostic).

## Chantiers de novembre 2026 (fil « trois chantiers »)

Plan validé par le coordinateur le 16 novembre. Ordre : 1, partie gratuite du banc, 2, banc complet,
lancement à 22 h.

1. « À travailler » actionnable — fait et revu par le coordinateur (2 itérations).
   - `src/lib/engine/prescription.ts` calcule pour chaque séance : la cible du format (allure + FC),
     « aurait dû » (une consigne principale, au plus une secondaire), « à reproduire » et « prochaine
     fois ». Règles : si la charge (≥ 1,5 fois la moyenne) ou l'enchaînement (< 72 h) explique la séance,
     le levier principal est le placement ; une correction d'exécution n'est prescrite que sur un
     indicateur dégradé par rapport aux comparables (dégradation ≥ 5 s/km ET ≥ comparables + 3) ; un
     écart ≤ 3 s/km à la cible ne donne aucun reproche (case « Aurait dû » vide) ; FC des répétitions
     ≥ comparables + 4 bpm pour ≤ 5 s/km de gain : consigne « tenir l'allure, viser la FC ».
   - Allure de course du moment = fourchette entre le seuil montre (ratios usuels 5 km ×1,06, 10 km
     ×1,025, semi ×0,975, marathon ×0,92) et ses répétitions longues VO2max des 12 dernières semaines
     (≥ 3 min, ≥ 15 min d'effort ; moyenne des deux meilleures = allure 5 km, Riegel 1,06 pour les autres
     distances). `raceEstimate`, `goalMarker`, `goalStatus`.
   - Objectif jugé (à portée ≤ 3 s/km, ambitieux ≤ 8, sinon « pas encore à portée : N s/km à gagner »)
     UNE seule fois : page Objectif (« Où tu en es ») et carte Progression. Les séances ne citent que
     le repère du moment (`paceReferenceSentence`).
   - Pas de consigne (`status: "none"`) si la séance est à plus de 25 s/km de la cible de son format.
   - Objectifs chiffrés : `raceTargets` dans l'objectif (Bastien : 5 km en 19:00, semi en 1:27:00).
   - `suggestion.ts` utilise les mêmes cibles (`intervalTarget`) pour seuil et VO2max.
   - Prompt `session-v8` (champs `keep`, `shouldHave`, `nextTime` ; anciens `wentWell`/`toWork` relus par
     `normalizeSessionOutput`). Prompt `outlook-v3` : le conseil d'exécution reprend la consigne de la
     dernière séance du même type (`Dashboard.lastSameType`).
   - UI : `components/activity/session-points.tsx` (cible chiffrée du moteur en tête de case),
     `components/goal/goal-status.tsx`.
   - Garde-fou : une plage de zones (« Z3–Z4 ») est acceptée.
2. Bilan hebdomadaire (Opus) — à faire.
3. Banc de tests nocturne à 22 h (LaunchAgent utilisateur) — à faire.

## État

- Branche `claude/project-thread-1m6x8x`, tout commité, rien poussé (push GitHub bloqué).
- Appels Claude réels faits dans ce fil : 6 (Sonnet, analyses du 13 et du 4 novembre, ~9 k tokens d'entrée cache compris et ~1,3 k de sortie chacun).
- Scripts ponctuels hors Next : `npx tsx --conditions=react-server <script>` (la condition contourne `server-only`).
