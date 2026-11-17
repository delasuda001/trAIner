# Passation — Sillage (ex trAIner)

Note tenue à jour à chaque étape commitée, pour qu'un nouveau fil reparte sans relire l'historique.
Dernière mise à jour : 17 novembre 2026 (après-midi).

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

## Test familial (fil « test familial », à partir du 16 nov. au soir)

But : faire tester Sillage par le père et le frère de Bastien (iPhone, rien à installer), via son
abonnement Claude le temps du test, et récolter leurs retours.

- Profils : registre central `data/sillage.db` (`src/lib/profiles/registry.ts` : profils, sessions,
  invitations, journal des connexions, réglages, retours). UNE BASE PAR PROFIL : Bastien garde
  `data/run-insights.db` (jamais migrée ; sauvegarde `data/backups/run-insights-2026-11-16-pre-profiles.db`),
  chaque invité `data/profiles/<id>.db`. `getDb()` exige un profil actif (AsyncLocalStorage,
  `profiles/context.ts` : `runAs`) ; jamais de repli sur la base de Bastien.
- Entrées : chaque page passe par `asMember`/`asAdmin`, chaque route par `apiAsMember`/`apiAsAdmin`
  (`profiles/request.ts`) ; `src/proxy.ts` renvoie vers /connexion sans cookie. Tout accès en base doit
  avoir lieu dans le rendu de la page (les composants ne lisent pas la base). Scripts (banc, gel) :
  `runAs(adminMember(), …)`.
- Connexion : lien d'invitation personnel à usage unique (7 jours, `/api/session/invitation?t=…`) ou
  code de secours long généré (20 caractères). Page /connexion sans aucun nom de profil. Sessions par
  appareil (cookie `sillage_session` 180 j, httpOnly, Secure en HTTPS ; seule l'empreinte SHA-256 est
  stockée), révocables. Freinage : 5 échecs/adresse → 15 min, 20 échecs/h → tout bloqué 30 min.
  Première entrée de Bastien : `npm run profiles -- invitation` (lien local).
- Invités : Sonnet imposé (`currentCoachModel`), banc / bilan Opus / choix du modèle refusés côté
  serveur ; plafonds par invité (défaut 40 k/jour, 150 k/7 j) et commun (250 k/7 j), arrêt si la
  fenêtre 5 h ≥ 60 % ou 7 j ≥ 70 % (`profiles/quota.ts`, `server/quota.ts`, contrôlé après le cache,
  avant l'appel). État de quota de l'abonnement désormais dans le registre.
- Garmin : une clé par profil, `GARMIN_API_KEY` (Bastien), `GARMIN_API_KEY_<ID>` (invité) dans
  `.env.local`, relu à chaud (`reloadEnv`). Invités : 12 mois de résumés, 120 j de bien-être, séries des
  12 dernières semaines, les plus anciennes chargées à l'ouverture de la séance (`fetchDetailNow`).
- Paramètres (Bastien) : créer un invité, lien/code affichés une seule fois, état de la clé Garmin
  (vérifiable, jamais affichée), plafonds, appareils, désactivation, coupure de l'accès des invités,
  adresse publique, journal des connexions. Il voit la consommation de chacun, jamais leurs séances
  ni leurs échanges avec le coach. Invité : sa consommation et ses appareils seulement.
- Gros volume (`engine/rhythm.ts`) : rythme habituel sur 12 semaines. Écart minimal entre deux
  qualités = son habitude (médiane des écarts, bornée 48–72 h ; 72 h faute de 4 écarts), utilisé par la
  consigne de placement, la suggestion et le « à 72 h au moins » ; seuil de hausse de charge 1,5 jusqu'à
  3 sorties/semaine, 1,3 dès 5, linéaire entre (`loadAlert(…, highLoadRatio)`). Bastien inchangé, vérifié
  par `scripts/engine-snapshot.ts` (consignes et empreintes de charge utile de ses 225 courses identiques
  avant/après). Consignes du coach : phrase de présentation remplacée pour un invité (rythme réel, pas le
  nom de Bastien ; `coach/athlete.ts`), texte de Bastien identique à l'octet. Temps mesurés sur une base
  synthétique de 939 courses (3 ans à 6/semaine, `scripts/volume-timing.ts`) : premier calcul des
  métriques 0,6 s, tableau de bord 35 ms, séance 10 ms.
- Retours : bouton « Un retour ? » (toutes les pages), pouce + note sous chaque analyse / conseil /
  réponse ; table `feedback` du registre ; vue /retours (Bastien) : thèmes (catégorie × écran), pouces
  par version de prompt, export Markdown (`lib/feedback/digest.ts`), synthèse Claude sur bouton
  (`feedback-v1`, Sonnet, cache par empreinte, usage `feedback`).
- Téléphone : en-tête d'une ligne, onglets en bas, coup d'œil « prochaine séance + progression » en
  haut de l'accueil (`MobileGlance`), thème et déconnexion dans Paramètres ; manifeste, icônes générées
  (`apple-icon.tsx`, `/icons/[size]`), plein écran iPhone. Accueil du testeur `/bienvenue` (après le
  lien d'invitation) ; « ce qui manque » (zones, seuil, objectif) sur l'accueil (`MissingInfo`).
- Accès retenu : Tailscale Funnel sur le Mac seul (adresse HTTPS stable en .ts.net), app sur
  127.0.0.1 (`npm start` = `next start -H 127.0.0.1`). NON INSTALLÉ : accord écrit de Bastien requis.
  Marche à suivre complète : `docs/ACCES.md`.
- Vérification de bout en bout (serveur d'essai) : invité créé, lien unique, accueil, plafonds ; l'appel
  réel du coach pour un invité a été REFUSÉ par la garde (abonnement à 76 % sur 7 jours, seuil invités
  70 %, remise à zéro le 17 nov. 2 h heure de Toronto) : chemin de refus vérifié, chemin d'appel réel
  encore à vérifier (≈ 10 k Sonnet + 6 k pour la synthèse des retours).
- Essais sans toucher à l'app de Bastien : `source data/test/env.sh` (base copiée, registre et
  build `.next-test` séparés, port 3100).

## Accueil invité, consommation, première synchro (fil du 17 nov.)

Plan validé par le coordinateur (2 séances pré-analysées, préparation comptée à part, jauge sans compte permanent).

- Première synchro : rien n'est plus lancé à l'aveugle chez l'invité. Bastien clique « Préparer le profil »
  (Paramètres, carte de l'invité, une fois la clé Garmin présente) : `server/prepare-service.ts` importe
  les 12 mois (tours de `syncNow` jusqu'à 0 série en attente), calcule toutes les métriques (`loadContext`,
  `getDashboard`, aucun token), puis analyse les 2 dernières séances et le conseil du jour (≈ 27 k,
  `PREPARATION_ESTIMATE`). Usage tracé kind `prepare` : hors plafonds personnels de l'invité, dans le
  plafond commun, sous la garde de l'abonnement. Coût affiché avant le clic, bouton bloqué si la garde
  refuserait (message pour Bastien avec l'heure de remise à zéro). État dans le registre
  (`prepare_<id>`), suivi toutes les 3 s ; si l'invité ouvre avant la fin : « Bastien prépare ton
  espace » avec l'avancement. Jamais d'analyse en masse ; ensuite à la demande, et la nouvelle séance
  automatiquement après une synchro (comportement antérieur), dans la limite du plafond.
- Objectif non bloquant : les sorties du coach portent « empreinte complète~empreinte sans objectif »
  (`coach/fingerprint.ts`). Saisir ou changer l'objectif ne périme plus une analyse de séance passée ;
  le conseil du jour (suggestion) reste périmé. Les anciennes sorties (une seule empreinte, dont toutes
  celles de Bastien) se lisent comme avant. Vérifié : photographie du moteur identique avant/après.
- Jauge de l'abonnement (invités) : `subscriptionGauge` (profiles/quota.ts) = fenêtre la plus chargée
  rapportée au seuil d'arrêt invités (60 % 5 h, 70 % 7 j) : large < 75 %, à ménager, presque plein ≥ 100 %
  (coach en pause, bouton désactivé). Fournie par le layout (`GaugeProvider`), affichée sous chaque
  `CoachRequest`, dans « Demander au coach », sur l'accueil et dans Paramètres de l'invité (plus aucun
  chiffre de tokens chez eux). UNE ligne (pastilles + niveau) ; le détail (remise à zéro, analyses
  restantes, seulement à 1 ou 0) s'ouvre au toucher ou après un appui sur un bouton du coach.
- Téléphone : plus de doublon. Le coup d'œil (prochaine séance, progression) reste en tête ; les grandes
  cartes correspondantes sont repliées et s'ouvrent d'un toucher sur la tuile (`dashboard/glance-tile.tsx`,
  attributs `data-open-next` / `data-open-progress`). Barre d'onglets : 91 px de marge sous le dernier
  contenu, mesuré (son apparition au milieu des captures pleine page est un effet d'assemblage). Messages de refus
  réécrits sur un ton positif.
- Accueil `/bienvenue` refait : « Bonjour {prénom}, tout est prêt », 3 chiffres marquants
  (`lib/welcome/highlights.ts` : km, courses, heures, semaines actives, meilleur mois ; allure à FC égale ;
  dernière séance et si elle est déjà commentée), prochaine séance, « Tu peux / Sillage ne fait pas »,
  le coach comme ressource partagée avec la jauge, installation repliée, un seul bouton « Voir mon
  tableau de bord » (objectif facultatif). Rien sur la connexion. Bouton « Un retour ? » plus discret.
- Exemples cliquables (`lib/goal/examples.ts`, `ui/example-chips.tsx`) : objectif (dont marathon,
  record sur semi, trail, gros volume), « À savoir pour le coach », note de séance. « Douleur » retiré
  du texte d'aide de la note (frontière médicale).
- « Le coach relit sa semaine » : retiré du tableau de bord et de la navigation ; /bilan reste (Bastien),
  lien et export Markdown depuis Paramètres (`GET /api/weekly-review/export`, `lib/weekly/markdown.ts`).
  Calcul inchangé.
- Rond rose : `.sticker-long` (texte > 10 caractères) et pastille de 72 px sur téléphone ; mesuré dans
  le cercle avec marge (−4,8 px téléphone, −8,9 px écran large, clair et sombre).
- Essais sans Claude : `SILLAGE_FAKE_COACH=1` remplace le client par `coach/fake-client.ts` (sortie
  conforme, sans chiffre, consommation fictive). Jamais en production. Sur le serveur d'essai, l'invité
  `papa` a la base synthétique `grosvolume` (939 courses) et a été préparé avec le client simulé.
  Captures : `data/test/cdp-shots.mjs` (Chrome headless, sans dépendance), mesure du rond :
  `data/test/cdp-eval.mjs`.
- Aucun appel réel à Claude dans ce fil. Le chemin réel de la préparation reste à vérifier au premier
  vrai invité (≈ 27 k Sonnet).

## Invités vouvoyés, confidentialité, hors ligne, prochaine séance (fil du 17 nov., après-midi)

Plan validé par le coordinateur (ordre 3, 2, 1, 5, 4). Aucun appel réel à Claude.

- Deux serveurs sur le port 3000 : un ancien `npm start` du 16 nov. (avant les profils, sans connexion,
  ouvert sur `*:3000` en IPv6) répondait sur `localhost`, le bon sur 127.0.0.1. Arrêt de l'ancien
  (PID 66898) : refusé à l'assistant, à faire par Bastien (`kill 66898`). `npm start` passe désormais par
  `scripts/check-port.mjs` (prestart) : refus de démarrer si 3000 est pris en IPv4 ou IPv6.
- Registre par profil (`src/lib/register.ts`) : Bastien « tu » (inchangé à l'octet, photographie du moteur
  identique), invités « vous ». Les phrases du moteur restent au « tu » et sont converties par `vouvoyer`
  (règles testées sur tous les gabarits du moteur : `register.test.ts`) dans `analytics.ts` (`voiceDeep` sur
  suggestion, consignes, verdict, contexte). Interface : `RegisterProvider` dans le layout, `<Say tu vous>` pour
  les composants serveur, `useSay()` côté client, `say(register, tu, vous)` dans les pages. Consignes du
  coach pour un invité : « Tu le vouvoies, ton professionnel » (`coach/athlete.ts`). Messages de quota,
  de session et d'échec du coach réécrits (neutres ou au « vous »). Nouveau texte au « tu » : toujours écrire
  les deux registres.
- Prénoms : les invités réels sont Benoît, Charles, Marie (pas « Papa »/« Frère »). Champ de création :
  prénom, aide « l'application le vouvoie ». Synthèse des retours : `feedback-v2` (plus de « père et frère »).
- Confidentialité (`components/profiles/privacy-notice.tsx`, accueil et Paramètres de l'invité) : stockage
  sur le Mac de Bastien, synthèses (jamais le GPS) envoyées à Claude via son compte personnel, engagement de
  Bastien à ne pas consulter (techniquement possible, dit tel quel), suppression sur demande. Entraînement des
  modèles : affirmé seulement si Bastien coche dans Paramètres « J'ai désactivé "Aider à améliorer Claude" »
  (`claude_training_opt_out` dans le registre) ; sinon renvoi à la politique d'Anthropic.
- Prochaine séance (`engine/suggestion.ts`) : `when.dates` = fenêtre de 1 ou 2 jours consécutifs, une seule
  séance ; `when.label` « Mardi ou mercredi ». Placement : premier jour possible (récupération minimale), +1 jour
  pour une séance dure si la récupération est « watch »/« poor », puis jour préféré de l'objectif ou jour habituel
  (`habitualDays` : ≥ 3 fois et ≥ 20 % des séances du genre sur 12 semaines ; qualité, longue, ou toutes) si
  atteint en 2 jours au plus. Lendemain ajouté sauf jours préférés imposés, course ou veille de course.
  « Ensuite » après la fenêtre. Rond rose : « dès aujourd'hui », « demain ou après », « mar. ou mer. ».
  Semaine : second jour en pointillé. Bastien : consignes de séance identiques ; sa suggestion du 17 nov.
  passe de « Aujourd'hui » à « Demain ou jeudi » (conseil du jour à régénérer, empreinte changée).
- Hors ligne (Mac éteint) : service worker `public/sw.js` (pages réseau d'abord avec 4 s de délai, copie
  gardée ; build en cache d'abord ; /api jamais en cache ; 502/503/504 = injoignable ; renvoi vers /connexion
  = tout effacé), `public/offline.html` pour une page jamais gardée. Préparation : `GET /api/offline` (accueil,
  objectif, coach, paramètres, 20 dernières séances dont les séries sont en base : aucun appel Garmin), au plus
  toutes les 30 min et après une synchro avec nouvelle séance. `components/offline/connection.tsx` : ping
  `/api/ping` (public), bandeau « Hors ligne … données du <date de rendu> » (`data-rendered-at` sur <html>),
  file d'attente du coach (`lib/offline/queue.ts`, localStorage, 10 au plus, une analyse une seule fois) montrée
  en clair (« Partira au retour du Mac : … », retrait possible), envoyée dans l'ordre au retour, compte rendu
  « N demandes envoyées » ou « Non envoyé : raison » (plafonds inchangés). Déconnexion : file et pages
  effacées. La synchro Garmin renvoie 424 (et non 502) en cas d'échec. Service worker enregistré en production
  seulement. Essai de bout en bout : `data/test/cdp-offline.mjs` (arrête puis relance le serveur d'essai 3100).
  Limite : iOS peut purger le cache d'une app non ouverte depuis plusieurs semaines.

## État

- Branche `claude/project-thread-1m6x8x`, tout commité, rien poussé (push GitHub bloqué).
- Appels Claude réels faits dans ce fil (au 16 nov. soir) : 24 Sonnet et 2 Opus dont la batterie du banc. Détail ancien : 6 Sonnet (analyses du 13 et du 4 novembre, ~9 k tokens d'entrée cache compris et ~1,3 k de sortie chacun) et 1 Opus (bilan).
- Banc, état au 16 nov. au soir :
  - Batterie 1 (manuelle, 124,9 k tokens, 13 appels) : session-v9 3,60 au juge contre 3,57 pour la
    variante `coach-v10`. Trouvé et corrigé : zone FC annotée sur la valeur non arrondie (faux rejets du
    garde-fou sur 4 analyses sur 6, chacune coûtait un second appel).
  - Décision du coordinateur : `session-v11` appliqué directement comme version en place (règle foulée,
    cause = hausse de charge corroborée ou facteur de contexte, sinon aucune ligne « cause probable »,
    cause cohérente avec la consigne, aucun calcul, pas de jargon, séance mal reconnue dite simplement
    via `format_reconnu`). Garde-fou ajouté : `findUnsupportedMultiples` (un « x fois » doit figurer tel
    quel dans le résumé). Vérifié sur le 10 et le 13 nov. (2 appels Sonnet), analyses affichées régénérées.
  - Reste à tester au prochain feu vert de Bastien (~55 k pour refaire la référence v11 sur les 6
    séances, puis ~70 k par variante) : référence v11 avec juge ; `sans-dynamique` ;
    `sans-liste-comparables`. La variante `coach-v10` a été retirée (intégrée à v11). Penser à `npm run bench:freeze` si le moteur a changé depuis le gel.
  - Corrections du moteur après relecture du coordinateur (prompt `session-v12`) : une seule référence
    de charge par contexte, `LoadFigure` (valeur, référence, ratio calculés ensemble, test
    d'invariance) ; plus de ligne « charge séance comprise » ; pas de reproche de placement pour une
    séance « au-dessus » avec récupération normale ; répétitions trop rapides détectées une à une (≥ la
    moitié hors fourchette) ; régularité = écart plus rapide / plus lente comparé au même indicateur des
    comparables ; jamais de « cause probable » d'un écart favorable. Analyses du 10 et 13 nov.
    régénérées (2 appels).
  - Le jeu figé du banc date d'avant ces corrections : `npm run bench:freeze` avant la prochaine batterie.
- Scripts ponctuels hors Next : `npx tsx --conditions=react-server <script>` (la condition contourne `server-only`).
