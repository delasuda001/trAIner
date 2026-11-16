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
2. Bilan hebdomadaire (Opus) — fait.
   - Dossier compact de la semaine : `src/lib/server/weekly-dossier.ts` (≈ 1 700 tokens). Pour chaque
     séance : la suggestion que le moteur affichait juste avant (recalculée « à date » par
     `suggestionBefore` dans analytics.ts) et son respect (`engine/adherence.ts`), la consigne
     « prochaine fois » de la séance précédente du même type et son respect, les consignes du moteur,
     la dernière analyse Claude, le ressenti. Plus les conseils du jour et questions de la semaine, les
     refus du garde-fou, les données manquantes.
   - Prompt et schéma : `src/lib/coach/weekly-review.ts` (`weekly-v1`, modèle `opus`). Sortie : carte
     (juste / pas juste / ce que le coach change), notes par conseil (pertinence et actionnable sur 5),
     contradictions, faiblesses, règles candidates (où : moteur ou prompt), données manquantes.
   - Génération : `generateWeeklyReview` dans `coach-service.ts` (même garde-fou, cache `coach_outputs`
     kind `weekly`, usage `coach_usage` kind `weekly`). Déclenchement : bouton sur /bilan (POST
     /api/weekly-review) ou tâche de nuit du dimanche. Semaine par défaut : la dernière complète, ou la
     semaine en cours le dimanche (`defaultReviewWeek`).
   - Affichage : carte courte sur le tableau de bord (2 semaines), page /bilan (historique, notes,
     règles proposées). Les règles candidates alimentent le banc ; rien n'est appliqué d'office.
   - Premier bilan (semaine du 9 nov., 1 appel Opus ≈ 9,4 k entrée, 5 k sortie) : a trouvé deux
     vrais défauts, corrigés aussitôt : le respect d'allure disait « dans la cible » avec la tolérance,
     et la charge citée comme cause incluait la séance elle-même (on utilise maintenant la charge
     avant la séance : `loadRatioBefore`). Règle candidate non appliquée, à arbitrer : désactiver
     l'alerte de charge 1,5 pour un coureur à 1–2 sorties par semaine.
   - Règle de charge (arbitrage du coordinateur) : le ratio 7 j / 4 semaines ≥ 1,5 ne déclenche une
     consigne (report, séance facile, libellé « Hausse marquée ») que s'il est corroboré : VFC basse,
     FC de repos haute, nuit courte, effort perçu ≥ 8/10, ou charge 7 j ≥ 1,3 × la semaine médiane des
     12 dernières (`loadAlert` dans `engine/load.ts`). Sinon simple repère. Envoyé à Claude dans
     `hausse_de_charge` (prompt `session-v9`).
3. Banc de tests nocturne — fait.
   - Code : `src/lib/bench/` (`types`, `variant` (retrait de clés), `grade` (notation déterministe
     gratuite), `budget` (plafonds), `judge` (Opus, A/B tirés au hasard), `report`, `store` (fichiers),
     `freeze` (jeu figé), `runner` (file de tâches)). Scripts : `scripts/bench-freeze.ts`,
     `scripts/nightly.ts` (`--dry-run`, `--force`).
   - Jeu figé : `data/bench/fixtures.json` (6 séances : fractionné long, court, seuil (mal reconnu),
     endurance, sortie longue, séance ratée), ignoré par git. Re-figer après un changement du moteur.
   - Variantes : `bench/variants/*.json` (versionné) : `systemPrompt` de remplacement et/ou `dropKeys`.
     Deux au départ : `sans-dynamique`, `sans-liste-comparables`. Les règles candidates du bilan
     hebdomadaire se transforment en variantes à la main.
   - File : sorties de la version en place, puis de chaque variante, puis un jugement Opus par
     variante ; sorties mises en cache par empreinte (prompt + charge utile + modèle), reprises nuit
     après nuit. Rapport : `data/bench/reports/<date>-<variante>.md` + index, affichés dans Paramètres.
     Recommandation adopter / rejeter / à creuser (`recommend`), jamais appliquée automatiquement.
   - Plafonds : 40 k tokens par nuit, 100 k par semaine (bilan + banc), comptés en entrée + sortie +
     écriture du cache ; arrêt si la fenêtre 5 h ≥ 60 % ou la semaine ≥ 70 % (fenêtres relevées par
     `claude-agent-client.ts`, persistées dans `app_state` clé `claude_rate_limits`). Variables :
     `BENCH_NIGHT_BUDGET_TOKENS`, `BENCH_WEEK_BUDGET_TOKENS`, `BENCH_MAX_FIVE_HOUR_UTILIZATION`,
     `BENCH_MAX_SEVEN_DAY_UTILIZATION`. Usage tracé dans `coach_usage` kinds `bench` et `weekly`,
     affiché à part dans Paramètres. Ordre de grandeur : ~9,5 k par génération, ~15 k par jugement :
     une variante complète ≈ 6 générations + 1 jugement ≈ 70 k, soit environ deux nuits.
   - Lancement : MANUEL (décision de Bastien du 16 nov. : il donne le feu vert quand son quota est
     libre). `npm run bench -- --budget=150000 --max-five-hour=0.7 [--only=variante] [--weekly]
     [--dry-run]`, ou le bouton « Lancer le banc » dans Paramètres (plafonds par défaut, en
     arrière-plan, `POST /api/bench`). Le bilan hebdo : bouton de /bilan ou `--weekly`.
   - OPTIONNEL, non installé : LaunchAgent `com.sillage.nightly` (`scripts/launchd/install.sh`, retrait
     `uninstall.sh`, sans sudo) qui lance `nightly.ts --scheduled` à 22 h (fenêtre 22 h – 5 h, pas
     d'usage de Bastien dans les 2 h, bilan le dimanche). L'installer exige l'accord écrit de Bastien.
   - Journaux : `data/bench/nightly.log` (événements), `data/bench/launchd.log` (sortie brute).

## État

- Branche `claude/project-thread-1m6x8x`, tout commité, rien poussé (push GitHub bloqué).
- Appels Claude réels faits dans ce fil : 6 Sonnet (analyses du 13 et du 4 novembre, ~9 k tokens d'entrée cache compris et ~1,3 k de sortie chacun) et 1 Opus (bilan).
- Première batterie du banc (16 nov., manuelle, 124,9 k tokens, 13 appels) : en place (session-v9) 3,60
  au juge contre 3,57 pour la variante `coach-v10` → à creuser. Trouvé et corrigé : zone FC annotée sur
  la valeur non arrondie (faux rejets du garde-fou sur 4 analyses sur 6). Proposé au coordinateur,
  en attente de son retour : une v11 (règle foulée de v10 + cause = hausse de charge corroborée,
  interdiction du jargon « moteur »). La référence est à refaire (charge utile modifiée).
- Scripts ponctuels hors Next : `npx tsx --conditions=react-server <script>` (la condition contourne `server-only`).
