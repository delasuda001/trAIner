# Passation — Sillage (ex trAIner)

Note tenue à jour à chaque étape commitée, pour qu'un nouveau fil reparte sans relire l'historique.
Dernière mise à jour : 18 novembre 2026 (soir, revue des premières analyses d'une invitée, lien d'invitation confirmé).

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
- Connexion : lien d'invitation personnel à usage unique (7 jours, `/api/session/invitation?t=…` ; depuis le 18 nov. le GET
  renvoie vers `/connexion/invitation`, et seul le bouton (POST) consomme le lien) ou
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

## Fractionné court et dense (17 nov., soir)

- Le 14 × 30/30 du 17 nov. était classé « seuil » : `detectWorkBlock` exigeait 8 min de travail au total
  (garde-fou contre les accélérations dans un footing) et 14 × 31 s n'en font que 7 min 20. Ajout : un bloc
  dense est reconnu à partir de 6 répétitions et 4 min de travail si le travail occupe au moins 40 % du bloc
  (de la 1re à la dernière répétition). `METRICS_VERSION` 11. Sept séances de Bastien deviennent des
  fractionnés (dont deux 30/30 de septembre 2025, un 7 × 45/65 et un 6 × 103/94) ; les autres écarts de la
  photographie viennent des comparables. Consigne : format ≤ 45 s, cible VMA (allure 1 000 m, seuil × 1,18 au lieu de × 1,14), récupération égale à l'effort et jusqu'à
  20 répétitions (`intervalPlan`). Jeu figé du banc à refaire (`npm run bench:freeze`).

## Chat, comparables par famille, tours regroupés (17 nov., soir)

- Chat du coach (« i is not a function ») : `useEffect(() => end.current?.scrollIntoView(...))` ; Chrome récent
  renvoie une promesse, prise par React pour la fonction de nettoyage. Corps entre accolades ; test
  `src/lib/effects-guard.test.ts` qui interdit tout effet à corps concis.
- Comparables par paliers (`selectComparables`) tant qu'il y en a moins de 3 : même format sur un an (inchangé,
  jusqu'à 5), puis même famille (fractionné court ≤ 75 s par rép, ou long ; durée totale de travail proche)
  sur un an, puis même format puis même famille jusqu'à 2 ans (pénalité d'ancienneté plafonnée à 1,1).
  `nature` (« format »/« family ») et `older` sur chaque comparable. Face à la famille : allure moyenne des
  répétitions et FC seulement, la régularité (écart, fade, CV) n'est calculée que sur le même format. Charge
  utile : `criteres` et les clés `nature`/`ancienne` n'apparaissent que si un comparable est élargi (les autres
  analyses gardent leur empreinte ; 20 fractionnés de Bastien changent). Interface : mention sous « Face à tes
  séances comparables » et dans la liste.
- Tours (`lib/activity/laps-view.ts`, `LapsCard`) : pour un fractionné, répétitions numérotées, puis lignes
  regroupées échauffement / récupérations (nombre, durée moyenne, allure, FC) / retour au calme ; « Voir les N
  tours » déplie le tableau complet. Sortie continue : inchangée.

## Ouverture à Marie (17 nov., soir)

- Tailscale installé par Bastien (App Store), Funnel activé par l'assistant après son accord écrit :
  `https://mac0172.tail204306.ts.net` → `http://127.0.0.1:3000` (`tailscale funnel --bg 3000`, reprend seul au
  redémarrage ; couper : `tailscale funnel --https=443 off`). Adresse enregistrée dans le registre (`public_url`).
- Vérifié par l'adresse publique : /api/ping 200, / → /connexion, API sans session 401, cookie de session
  `Secure; HttpOnly; SameSite=lax`. Adresse du journal vue depuis le Mac = son IP Tailscale ; à revérifier à la
  première connexion de Marie (adresse réelle si Tailscale transmet X-Forwarded-For).
- Lien d'invitation de Marie créé (usage unique, 7 jours, adresse publique). Restent à Bastien : sa clé Garmin
  (`GARMIN_API_KEY_MARIE`), la case confidentialité, « Préparer le profil », puis l'envoi du lien.

## Profil invité de test de Bastien (17 nov., nuit)

- But : Bastien vit le parcours d'un invité (lien, `/bienvenue`, vouvoiement, plafonds, jauge, hors ligne) sur ses
  propres données. Profil `bastientest` (nom « Bastien »), rôle invité, colonne `test_of = 'bastien'` (migration 3
  du registre), clé Garmin `GARMIN_API_KEY` (la sienne), sans code.
- Paramètres → carte « ton profil invité de test » : « Créer mon profil test » / « Réinitialiser et nouveau lien »
  (`POST /api/test-profile`, `server/test-profile-service.ts`). Copie cohérente de `run-insights.db` (backup SQLite,
  base de Bastien seulement lue) vers `data/profiles/bastientest.db` (poignée fermée avant), effacement de
  `coach_usage`, `coach_chat_messages`, sorties `weekly`/`feedback` ; première connexion remise à zéro, appareils et
  invitations révoqués ; statut de préparation « prêt » ; nouveau lien (adresse publique).
- Pas de « Préparer le profil » : les sorties à jour chez Bastien (20 dernières séances + conseil du jour) sont
  réétiquetées avec l'empreinte de la charge utile vouvoyée (`currentCoachOutputs` / `adoptCoachOutputs`), texte au
  « tu ». Sur une copie de la vraie base : 244 courses, 3 analyses reprises, 0,4 s.
- Coach simulé par défaut pour ce profil (réglage `test_profile_coach_simulated`, case dans la carte) : client simulé,
  consommation fictive, garde de l'abonnement ignorée, plafonds personnels inchangés. Profil de test exclu du plafond
  commun des invités, du total « invités » de Paramètres et de la vue « Tous » / export / synthèse des retours (chip
  dédiée « Bastien · test »).
- Le lien remplace la session du navigateur où il s'ouvre : fenêtre privée ou autre navigateur (sinon, se reconnecter
  en administrateur avec son code ou `npm run profiles -- invitation`).

## Revue produit et écart à l'objectif (18 nov., nuit)

Revue candide : `docs/REVUE-PRODUIT.md` (écart à l'objectif = volume et fréquence, pas l'exécution ; comparaison
aux autres outils ; analyses jugées ; priorités). Points 1 à 4 validés par le coordinateur et faits, sans appel à Claude.

- Seuil observé (`engine/threshold.ts`) : répétitions ≥ 6 min ou ≥ 1 600 m, ≥ 15 min de travail, 8 dernières
  semaines, FC moyenne entre FC seuil − 6 et + 3, ≤ 10 m D+/km ; moyenne des allures des 3 plus récentes. Remplace
  le seuil montre seulement s'il est plus rapide d'au moins 8 s/km. Branché dans `loadContext` :
  `profile.lactateThresholdSpeedMps` = seuil retenu, `profile.threshold` = détail (`basis`, preuves). Bastien :
  4:10/km (3 × 2 km du 13 nov. à 168 bpm) contre 4:21 montre. Phrases : « seuil observé » / « seuil montre »
  (`thresholdLabel`). Le seuil est celui d'aujourd'hui, aussi pour les séances passées (comme la montre).
- Classement (`classifyKind`, `METRICS_VERSION` 12) : répétitions ≥ 6 min ou ≥ 1 600 m = seuil, sauf FC moyenne
  > FC seuil + 8 (VO2max) ou sous la Z4 (tempo). Raison : les zones Garmin de Bastien font commencer Z5 (167) sous
  sa FC seuil (169), donc tout 3 × 2 km était « VO2max ». FC cible d'un travail au seuil : FC seuil − 5 à + 2
  (164–171, « Z4–Z5 »), plus la Z4. FC au-dessus de la cible : une seule consigne d'intensité.
- Répétitions < 60 s (`SHORT_REP_S`) : pas de jugement répétition par répétition (pas de « 1re répétition », pas de
  répétitions « trop rapides » une à une), perte en fin de série jugée à partir de 10 s/km, consigne sur la moyenne.
  Charge utile : ni `detail_repetitions` ni écart plus rapide / plus lente, une ligne `precision`.
- Écart à l'objectif (`engine/goal-gap.ts`) : sur 8 semaines, sorties/semaine, km/semaine, plus longue sortie,
  allure au seuil, face à des repères d'entraîneur par distance (semi < 4:30/km : 3 sorties, 40 km, 18 km ; 5 km
  < 4:00 : 3, 30 km, 12 km ; seuil nécessaire = allure visée × ratio de course). Levier principal : fréquence ou
  volume sous 70 % du repère, puis sortie longue, puis seuil. Action chiffrée : « Passe à N sorties par semaine
  (une de plus à la fois) : ajoute un footing… ; ensuite, allonge ta sortie longue de 2 km toutes les 2 semaines
  (11 → 18 km en 8 semaines) ». `Dashboard.goalGaps`, `SessionAnalysis.goalGaps` (vu le jour de la séance).
  Affiché page Objectif (tableau des leviers) et carte Progression (action seule).
- Prompt `session-v13` : champ `goalLink` (« Pour ton objectif » sous les consignes), reçoit `ecart_objectif` ;
  `detail` réduit à 2–3 phrases nouvelles ; foulée envoyée seulement si un écart ressort (`notableDynamics`),
  sinon « n'en parle pas » ; `reperes_athlete.seuil` avec son origine. Taille d'entrée +~40 tokens.
- Photographie du moteur : 38 consignes sur 244 changent, aucun verdict ; toutes les empreintes changent (nouvelles
  clés), donc toutes les analyses sont « à mettre à jour ». Jeu figé du banc à refaire (`npm run bench:freeze`).
- Semaine type (`WeekPlan`, `weekPlanFor` dans analytics) : si le levier principal de l'objectif le plus long est
  structurel (fréquence, volume, sortie longue), `suggestNextSession` vise `max(sorties déclarées, une de plus que
  l'habitude)` sorties : après une séance dure, footing Z2 de 35 min au plus tôt (sans attendre le jour habituel,
  « si ton planning le permet »), la sortie longue en « Ensuite » ; sortie longue en km (`nextLongRunKm` : +2 km
  quand la plus longue des 8 semaines a été tenue deux fois en 4 semaines, sinon on consolide, plafond = repère),
  une sortie facile ≥ (km visés − 2,5) compte comme longue ; qualité dès 5 jours. Bastien au 17 nov. : footing
  35 min jeudi ou vendredi, puis sortie longue de 13 km samedi.
- Bilan hebdo `weekly-v2` : `habitudes_8_semaines` (courses, par type, sorties faciles par jour) et `ecart_objectif`
  dans le dossier ; interdit d'affirmer une habitude contredite ou une règle contraire au levier.
- `session-v14` : « keep » ne reprend pas un indicateur corrigé dans « aurait dû » ; une qualité à 72 h ou plus
  n'est pas une cause. Répétitions < 60 s : perte en fin de série jugée face à la perte (%) des comparables
  (`repFadePct`), « à reproduire » = l'allure moyenne si elle est dans la cible. Verdict : le signal de régularité
  compare l'écart à l'écart des comparables (il mélangeait perte et écart), et pour < 60 s seulement la perte.
- Vérification réelle (feu vert de Bastien) : 6 appels Sonnet le 18 nov. (≈ 71 k tokens cache compris, 8,8 k de
  sortie, ≈ 1 000 de sortie par analyse contre 1 300–1 500 avant) sur le 13 et le 17 nov. ; analyses affichées à
  jour en v14. Reste vu : le verdict du 13 nov. dit « En dessous » pour 4 s/km corrigés de la FC face à des
  comparables dont l'un était couru trop fort (175 bpm) alors que la consigne dit « rien à corriger » ; le coach
  avance encore parfois une explication non fournie (« départ trop rapide » sur le 30/30).
- Ensuite (commit 25e2e6e) : verdict des fractionnés neutre jusqu'à 5 s/km d'écart corrigé de la FC
  (`INTERVAL_GAIN_THRESHOLD_S` 6 ; le 13 nov. passe « dans tes repères ») ; `causes_possibles` dans la charge
  utile (`possibleCauses` : hausse de charge corroborée, qualité plus proche que l'écart habituel, signaux de
  récupération, effort perçu ≥ 8, note) et garde-fou `findUnsupportedCauses` (« parce que », « à cause de »,
  « cause probable », « trop rapide pour tenir »… refusés quand la liste est « aucune ») : `session-v15` ;
  `ecart_objectif` dans le conseil du jour (`outlook-v4`), régénéré le 18 nov. (1 appel, ≈ 6,7 k). Les analyses
  du 13 et du 17 nov. sont de nouveau « à mettre à jour » (v15), à régénérer d'un clic.

## Carte forme aérobie et calendrier des séances (18 nov., nuit)

- Carte « Forme aérobie » (`ProgressionCard`) : verdict en clair d'abord (`progressionVerdict` dans
  `engine/explain.ts` : « Ça progresse » / « C'est stable » / « Ça recule » / « Pas encore de tendance »),
  une raison chiffrée en s/km, puis « Ton allure si tu courais à N bpm » (N = `referenceHeartRateBpm`,
  le même partout : carte, tuile mobile, explication). « Comment c'est calculé ? » en `<details>`
  (toucher et clavier). Plus de pilule « stable ≈ » inclinée ni de « à FC égale » dans le texte visible.
- Tableau de bord : la grille de tête a `align-items: start` (`.home-hero`) ; colonne gauche = carte
  jaune + calendrier (`components/dashboard/session-calendar.tsx`), colonne droite = forme aérobie.
- Calendrier : `engine/calendar.ts` (`trainingCalendar`, pur, testé), `Dashboard.calendar`. 8 semaines,
  case colorée par zone dominante (code Sillage), autre sport = point gris, séance proposée en
  pointillé rose (jour de repli plus pâle), pastilles de courses face à la cible (`weekPlan.runsPerWeek`,
  sinon `goal.runsPerWeek`), jamais de rouge ; la semaine en cours n'est pas jugée (« encore 2 possibles »).

- Retours du 18 nov. (2e passe) : carte aérobie = allure en gros en haut (« ton allure quand tu cours à
  N bpm »), verdict en badge incliné à droite, une phrase (« bien moins que ta variation habituelle »,
  sans le ±), calcul en une ligne dépliable ; la phrase du coach sur la progression n'est plus affichée
  sur la carte (redite). Bande « semaine » retirée de la carte jaune (le calendrier la montre).
- Téléphone : plus de tuiles de coup d'œil (`glance-tile.tsx` supprimé). Les vraies cartes s'affichent
  en version courte et se déplient sur place (`.card-collapsible`, `.card-more`, `dashboard/expand-toggle.tsx`) ;
  ordre : prochaine séance, forme aérobie, calendrier.
- Zones FC par profil : montre d'abord ; sinon `zonesFromHistory` (3e FC max la plus haute sur 2 ans,
  ≥ 5 courses, puis % de FC max) ; valeurs provisoires seulement sans aucune FC. `Profile.zonesSource`,
  phrase `zonesSourceSentence` affichée sous le calendrier. Bastien : zones montre (seuil 169, Z5 dès
  167 = convention Garmin, présentée « seuil à la limite Z4/Z5 »). La charge utile séance écrit aussi
  « 169 bpm (limite Z4–Z5) » (`thresholdAtZ4Z5Boundary`, accepté par le garde-fou de zones) ; les
  analyses en cache passent « à mettre à jour », sans appel automatique.

- 18 nov., après-midi : FC de référence de la carte aérobie propre au profil (`personalReferenceHeartRate`
  dans `engine/progression.ts`) : milieu de la Z2 montre (Bastien 128–148 → 138 bpm, avant 135 = médiane
  des FC de footing arrondie à 5) ; sinon ~80 % de la FC seuil ; sinon FC médiane des sorties faciles
  ramenée dans la Z2 du profil ; sinon milieu de la Z2 déduite. `Progression.referenceSource`.
  Carte : allure en gros + badge de verdict sur la même ligne (`.aerobic-head`, badge non absolu),
  « Pas assez de données » au lieu de « Pas encore de tendance », une seule phrase d'action reliée au
  levier de l'objectif (`progressionAction`, « tes objectifs » si plusieurs objectifs au même levier),
  écart chiffré et source de la FC dans « Comment c'est calculé ? » (`progressionExplanation`).
  `vouvoyer` conjugue « tu cours / courais / tiens / fais / as / es » (« vous cours » corrigé).
  La FC de référence entre dans la charge utile du conseil du jour : il passe « à mettre à jour »,
  aucun appel fait.

## Revue des premières analyses d'une invitée (18 nov., soir)

Aucun détail de ses données ici (engagement de confidentialité). Défauts génériques trouvés et corrigés sans appel à Claude :

- Objectif saisi en texte seul (ex. « 10 km sous 50 min ») : `inferRaceTarget` / `withInferredTarget` (`goal/goal.ts`),
  appliqué dans `readGoal` (rien n'est écrit en base). Distance et temps saisis à part, sinon lus dans le titre
  (km, semi, marathon ; « 50 min », « 50:00 », « 1h45 », « 49' » ; allure plausible 2:30–12:00/km). Sans cela,
  ni écart à l'objectif, ni semaine type, ni `goalLink`.
- Fractionné sans allure cible (montre sans seuil, pas d'objectif à cette distance) : plus de consigne « 1re répétition
  à N bpm, pas plus vite » ; FC des répétitions dans la cible = séance tenue (`hrOnTarget`), progression « une
  répétition de plus » avec l'allure du jour comme repère.
- Charge utile séance : `recuperation_moyenne` et durée des répétitions en chrono (1:30) ; `formatDuration` tronquait
  à « 1 min ». Bastien : aucune consigne ni verdict changé sur 244 séances, 25 empreintes de fractionnés changent.
- Lien d'invitation : consommé par un robot d'aperçu de messagerie (navigateur inconnu, jamais revu) ; l'invitée a dû
  passer par son code. Le GET ne consomme plus rien. La session du robot (« appareil, navigateur ») est à révoquer par
  Bastien dans Paramètres.
- Arbitrages du coordinateur (même soir), faits :
  - Sortie facile ou longue avec ≥ 25 % du temps au-dessus de la Z2 (`EASY_ABOVE_Z2_LIMIT`, `easyAboveZ2Share`) :
    signal « à surveiller » au verdict (`easy_intensity`, poids 1) et consigne « Intensité : N % du temps au-dessus
    de X bpm (haut de Z2) ; ralentis dès que tu le dépasses » ; plus de « FC moyenne… à reproduire » dans ce cas.
  - Tempo (`tempoTarget`) : allure « 10 km » si tous les objectifs chiffrés font 10 km au plus, sinon « semi ».
    FC resserrée à ~10 bpm : avec FC seuil montre, semi −10 à −1, 10 km −6 à +3 ; sans, autour du début de la Z4
    (semi −7 à +3, 10 km −3 à +7).
  - Bastien (photographie) : 27 endurances reçoivent la consigne d'intensité (3 depuis juin 2026), 7 verdicts passent
    de « au-dessus » à « dans la ligne » (tous avant 2026), 2 tempos ont la fourchette resserrée (159–168 au lieu de
    149–166). Suggestion du jour inchangée.
- Retours de l'invitée relayés par Bastien (même soir), corrigés :
  - Cumuls amputés : les courses dont les séries ne sont pas encore chargées (invités, au-delà de 12 semaines,
    `detail_status = pending`) étaient exclues de `loadContext().runs`, donc des km de l'année (accueil), du rythme,
    des habitudes et du calendrier. Elles ont maintenant des métriques tirées du résumé seul (comme une séance
    « failed ») ; le passage à « ready » les efface et les recalcule avec les séries. Bastien : toutes ses courses
    sont « ready », rien ne change.
  - Séance d'après (`suggestNextSession`) : elle était décidée au jour de la prochaine séance et non au jour où elle
    peut avoir lieu, ce qui écartait une qualité due. Décidée maintenant au plus tôt après la fenêtre et l'écart du
    rythme (`decideOn`). Avec une semaine type à 2 sorties : après une qualité, la sortie suivante est la longue si
    elle est due (sinon la longue ne venait jamais), puis la qualité. Bastien : suggestion et « ensuite » identiques.
- Forme aérobie « pas assez de données » (invitée à 1 sortie par semaine) : la carte compare deux périodes de 8 semaines (3 sorties faciles avec séries par période) ; les séries des invités ne couvraient que 12 semaines, la période précédente n'avait donc que 2 sorties exploitables. Fenêtre de séries portée à 16 semaines (`GUEST_DETAIL_WEEKS`) : se complète à la prochaine synchro (Garmin, sans jeton). Si une période reste sous 3 sorties, la carte reste honnête.
- Objectif et retours de l'invitée (19 nov., nuit) :
  - Page Objectif / carte Progression : la section n'apparaissait que s'il existait un repère d'allure (`goalMarkers`) ;
    sans seuil montre ni répétitions VO2max, rien, même pas les leviers. `GoalStatusList` affiche maintenant les écarts
    sans repère, avec une phrase qui dit pourquoi l'allure n'est pas estimable et quelle séance la donnera.
  - Seuil observé sans FC seuil montre (`thresholdBand`) : bande = Z4 du profil, mention « indicatif ». La séance
    « Seuil 3 × 10 min » que le moteur lui propose (FC en Z4) donnera donc un seuil observé, puis les estimations.
    Bastien (FC seuil connue) : inchangé.
  - Calendrier : couleur = zone du travail pour une séance de qualité (`calendarZone` : tempo 3, seuil 4, VO2/court 5),
    zone dominante sinon. Un fractionné ne passe plus pour une endurance (échauffement et récupérations dominaient).
  - Retour « interface dense, peu ludique, je ne sais pas comment tout utiliser » : non traité dans le code, à arbitrer
    par Bastien (vue essentielle par profil, guide de démarrage).
- Vue « essentiel » (décision du coordinateur, 19 nov.) : réglage par profil `dashboard_view` dans `app_state`
  (`lib/view-mode.ts`, `PUT /api/view`, `ViewPicker` dans Paramètres pour chacun). Défaut : essentiel pour un invité,
  complète pour Bastien ; `/?vue=complete` (« Voir le détail ») ouvre la vue complète sans changer le réglage.
  Contenu (`components/dashboard/essential.tsx`) : carte jaune, jauge d'objectif (une barre par levier, remplie à
  la part du repère, levier principal marqué, allure du moment si estimable), calendrier, forme aérobie en une
  ligne. Ordre téléphone : séance, objectif, calendrier, forme. Mini-guide 3 étapes (`start-guide.tsx`) à la première
  ouverture, « Passer », bouton « Guide » pour le rouvrir ; « déjà vu » en localStorage (commodité de l'appareil).
  Vue complète inchangée. `GoalGap.targetTimeS` : temps visé exact (l'allure arrondie donnait 1:45:08).
- Reste à vérifier : écart « à FC égale » en endurance face à des comparables à FC très dispersées (`comparable.ts`).

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

## Proposition du 19 nov. (branche locale `claude/proposition-accueil-19nov`, en attente de validation, non fusionnée)

- Sorties possibles déclarées = plafond (`goalGap(…, availableRunsPerWeek)`) : jamais « passe à 3 » si l'objectif dit 2 ;
  à 2 sur 2, le levier passe au volume par la durée des sorties ; `availabilityNote` (repère hors agenda, option de revoir
  l'objectif) ; `possibleShare` (trait sur la barre). Semaine type = sorties déclarées. Bastien : sortie longue 13 km samedi
  au lieu du footing 35 min ; consignes et verdicts de ses 244 séances identiques.
- `primaryGap` (jauge, lien à l'objectif, semaine type). Analyse dont seul l'objectif a changé (`goalStale`) ou à mettre
  à jour : « Pour ton objectif » = action du moteur, plus la phrase périmée du coach.
- Accueil : mêmes en-tête et cartes du haut dans les deux vues (carte jaune + calendrier ; forme aérobie + jauge) ;
  graphique des sorties faciles et chiffres dans « Comment c'est calculé ? » ; boutons Guide / coach alignés, détail de
  la jauge en bulle (0 px de déplacement mesuré). `AerobicLine` supprimée.
- Consigne clé surlignée (`lib/coach/emphasis.ts`, `CoachText`) : déterministe, au plus 2 segments, exclut passé,
  comparaisons, projections, pas de progression ; aucun changement de prompt.
- `classifyKind` (`METRICS_VERSION` 13) : sans FC seuil montre, fractionné « tempo » seulement 5 bpm sous la Z4 estimée.
- (même branche, 19 nov. soir) Carte objectif à pages (`engine/goal-pages.ts`, `dashboard/goal-carousel.tsx`) : chrono
  (leviers), distance sans temps (plus longue sortie, +1 km), régularité (série de semaines à la cible, palier 2/4/8/12/26/52) ;
  « prochain palier » sur chaque page (chrono atteint : −2 %). Niveau déduit (`engine/athlete-level.ts`) sur l'expérience
  (ancienneté, mois actifs, séances structurées), pas le volume : Bastien = confirmé. Débutant en vue essentielle : régularité
  d'abord, pas de carte forme aérobie, zones dites en mots (facile/soutenu/intense), pas de seuil ni d'allure du moment.
  Profil fictif `debutant` (« Léa », 21 courses synthétiques, objectif « Courir mon premier 10 km ») sur le serveur d'essai.
- (même branche) Séances du débutant (`suggestion.ts`, `beginner`) : ni seuil ni VO2max ; alternance sortie ludique (footing +
  accélérations, fartlek ludique, footing progressif, à tour de rôle) / sortie un peu plus longue (+10 min sur la plus longue,
  90 min au plus). Vérifié : photographie de Bastien identique, suggestion de Marie identique (niveau confirmé).
- (19 nov., 23 h, branche `claude/proposition-retours-19nov`) Surlignage de la consigne : un seul style (fond blanc, trait rose,
  encre fixe), sans color-mix. « Pourquoi » de la prochaine séance en langage de coureur (« Ta semaine a été nettement plus
  chargée que d'habitude… ») ; chiffres dans `Suggestion.reasonDetail` (« Le détail ») ; carte charge (`loadMeaning`) sans
  chiffres ni médiane ; `outlook-v5` (règle : pas de charge brute, ratio ni médiane dans suggestionWhy). Demander au coach :
  choix d'une séance (12 dernières, celles qui correspondent à la question en tête), `seance_choisie` (~300 tokens, résumé,
  consignes, ressenti, ce que le coach en a dit) en tête du contexte, `chat-v3` ; lien depuis la page d'une séance.
- (19 nov., nuit, branche `claude/proposition-connexion-19nov`) Connexion : une adresse pour tous (l'adresse publique), prénom
  + code personnel. Invités : code à 6 chiffres (`generateGuestCode`), gardé lisible dans le registre (`guest_code`, migration 4)
  pour que Bastien le voie et le régénère ; vérifié par empreinte comme avant. `findByNameAndCode` (prénom sans accents ni casse,
  le code départage deux prénoms identiques). Sans prénom, seul un code long passe (anciens codes). Freinage inchangé. Anciens
  liens d'invitation encore valides ; lien déjà servi → /connexion « plus nécessaire ». Paramètres : code affiché sur la carte de
  l'invité (« Régénérer le code ») ; côté invité, « Ouvrir Sillage sur un autre appareil » (adresse, prénom, code).
- (20 nov., branche `claude/proposition-donnees-rares`) Données rares, règles générales déclenchées par les données :
  FC de référence recalée (`easy_above_z2`) si la médiane des FC de footing ≥ haut de Z2 + 5 bpm sur ≥ 5 sorties (Bastien
  135/148, Marie 150/149 : non) ; si la tendance est impossible, `progression.estimate` (`historicalEstimate` : 25 %
  meilleures sorties faciles sur 12 mois, séries ou résumé, poids 2 face à chaque sortie récente, confiance selon leur
  nombre) affiché « Estimation » avec la VO2max montre ; régularité sans 0 (« N sem. sur 8 à la cible ») ; sorties déclarées
  sans montre (`declared_runs` dans app_state, API `/api/declared-runs`) : régularité et calendrier seulement. Diff du
  tableau de bord à zéro pour Bastien, Marie et Léa ; photographie du moteur de Bastien identique.
