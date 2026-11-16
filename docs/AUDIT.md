# Audit du projet Run Insights (trAIner) avant le pivot

Date : 16 novembre 2026. Périmètre : état du dépôt `/Users/bastienduthu/Documents/Projects/trAIner`
(branche `main`, commit `df95729` plus 24 fichiers modifiés et 17 fichiers non suivis, non commités).
Aucun code n'a été modifié pendant cet audit.

Objectif du pivot rappelé : se connecter directement à Garmin (sans intervals.icu), remplacer Gemini
par Claude utilisé localement sans clé API Anthropic, et livrer un dashboard soigné qui met en avant
une suggestion de prochaine séance, un indicateur de progression et des analyses de type coach qui
comparent chaque séance à des séances comparables passées.

---

## 1. Synthèse en dix points

1. **Le projet tourne.** `lint` et `typecheck` passent, `next build` réussit, `next start` sert toutes
   les pages et API en 200. Un test sur 224 échoue (bug d'horloge, voir §3).
2. **La clé `GARMIN_API_KEY` ne fonctionne avec aucune API Garmin testée.** Elle n'a pas la forme
   d'un jeton OAuth Garmin, l'API officielle (`apis.garmin.com`) la rejette en 401, et l'API Garmin
   Connect répond « Token is not active ». C'est le principal bloquant du pivot (voir §5).
3. **Claude en local sans clé API est faisable et vérifié.** Le CLI Claude Code 2.1.266 est installé
   et connecté à un compte claude.ai **Pro**. Un appel headless `claude -p --json-schema` renvoie une
   sortie JSON structurée en environ 4 secondes (modèle par défaut : Sonnet). Voir §6.
4. **Les données réelles sont modestes mais exploitables** : 122 activités depuis le 26/08/2025
   (91 courses, 895 km, plus natation, vélo, rando, ski de rando, surf, muscu), toutes avec FC,
   aucune avec puissance. intervals.icu expose aussi HRV, sommeil, FC repos, VO2max et CTL/ATL.
   La base locale n'en a que 22 (courses uniquement, dernière synchro le 22/09/2026).
5. **Le moteur d'analyse déterministe (`src/lib/analysis`) est la partie la plus précieuse** :
   segmentation, rôles de segments, signature de séance, séances comparables, seuil dynamique,
   zones, verdict. Il est testé et largement indépendant de la source. À garder et adapter.
6. **Le couplage à intervals.icu est profond** : la colonne `intervals_activity_id` est la clé de
   jointure de 6 tables, et 33 fichiers source y font référence. Il faut une couche « source »
   abstraite avant de brancher Garmin.
7. **Gemini est confiné à un seul client** (`src/lib/llm/gemini-client.ts`) appelé par 3 routes.
   Le contexte JSON et les schémas Zod sont réutilisables tels quels avec Claude.
8. **La qualité des débriefs Gemini actuels est discutable** : contradictions internes (cadence
   cible 80 puis 86 spm), cadence probablement exprimée en pas par jambe (83 au lieu de ~166),
   seuil calculé à 5:06/km jugé peu fiable alors que l'allure seuil déclarée est 4:15/km.
9. **L'UI est propre mais orientée « journal »** : pas de suggestion de prochaine séance, pas
   d'indicateur de progression, page d'activité très verbeuse. Le dashboard est à refaire.
10. **Ménage à prévoir** : un export de conversation Copilot de 10,9 Mo (`trainer_copilot_save.json`)
    et son résumé de 290 Ko sont versionnés dans Git, ainsi que des `.DS_Store`.

---

## 2. Stack, structure et démarrage

| Élément | Valeur |
|---|---|
| Framework | Next.js 16.3.2 (App Router, Turbopack), React 19.2 |
| Langage | TypeScript 6 strict |
| Style | Tailwind CSS 4 (shadcn/ui annoncé dans AGENTS.md mais non installé : pas de `components.json`, composants maison) |
| Base | SQLite via `better-sqlite3` 13 + Drizzle ORM 0.45, fichier `data/run-insights.db`, 5 migrations dans `drizzle/` |
| Validation | Zod 4 |
| Graphiques | Recharts 3 |
| LLM | `@google/genai` 2.21 (utilisé) et `@google/generative-ai` 0.24 (installé, inutilisé) |
| Tests | Vitest 4 (33 fichiers, 224 tests) |
| Node | 24.15.0 (`.nvmrc`) |

Arborescence utile :

```
src/app/            pages (/, /activities/[id], /context, /assistant) et 21 routes API
src/components/     UI (dashboard/, context/, activity-detail, activity-list, manual-session-*)
src/lib/intervals/  client HTTP, schémas Zod, mapper, streams, synchro
src/lib/analysis/   moteur déterministe (≈ 2 000 lignes + tests)
src/lib/llm/        construction du contexte, schémas de réponse, client Gemini
src/lib/db/         schéma Drizzle, client, 11 dépôts (repositories)
src/lib/dashboard/  calendrier et volume hebdomadaire
docs/               22 documents de spécification (00 à 22)
decisions/          6 ADR (dont ADR-002 « Intervals.icu comme source de vérité »)
```

Démarrage local : `npm install`, puis `npm run dev` (ou `npm run build && npm start`), avec
`.env.local`. Les commandes de contrôle sont `npm run check` (lint + typecheck + tests).

### Résultats des vérifications (16/11/2026)

| Vérification | Résultat |
|---|---|
| `npm run lint` | OK |
| `npm run typecheck` | OK |
| `npm test` | **1 échec / 224** : `threshold-basis.test.ts:94` (voir §3) |
| `npm run build` | OK, 14 pages générées |
| `next start` | OK : `/`, `/context`, `/assistant`, `/activities/[id]`, `/api/dashboard`, `/api/activities`, `/api/performance-profile`, `/api/goals` répondent 200 |

---

## 3. Bugs et dettes constatés

- **Test en échec dépendant de l'horloge.** `estimateThreshold` (`src/lib/analysis/thresholds.ts:300`)
  lit `Date.now()` au lieu de recevoir la date de référence. Le test fixe un `NOW` passé, donc
  `freshnessAlert` devient vrai avec l'heure réelle. Correctif : injecter `now` en paramètre.
- **Cadence probablement en pas par jambe.** `average_cadence` d'intervals.icu (ex. 83) est stocké tel
  quel dans `averageCadenceSpm` (`src/lib/intervals/mapper.ts:19`). Les débriefs parlent ensuite de
  « 80 spm », ce qui est faux pour un coureur (≈ 166 pas/min). À doubler et à tester avec la
  nouvelle source.
- **Seuil dynamique fragile.** Avec 20 semaines et peu d'efforts maximaux, le seuil calculé
  (5:06/km) est en confiance faible et l'application bascule sur le repère déclaré (4:15/km).
  L'écart de 50 s/km montre que l'estimation n'est pas exploitable aujourd'hui sans plus d'historique.
- **Modèle Gemini codé en dur** (`gemini-client.ts`, `const MODEL = "gemini-3.8-flash"`), la variable
  `GEMINI_MODEL` est ignorée. Les 11 analyses stockées mélangent 4 modèles et 4 versions de prompt.
- **Gros travail non commité** sur `main` (24 fichiers modifiés, 17 nouveaux, dont 6 modules
  d'analyse et leurs tests). Il faut le commiter avant de lancer le pivot, sinon les threads
  d'implémentation partiront d'un état ambigu.
- **Fichiers parasites versionnés** : `trainer_copilot_save.json` (10,9 Mo, export de conversation),
  `copilot_summary.md` (290 Ko), `clean_copilot.py`, `.DS_Store`. `.gitignore` ignore bien `.env.local`.

---

## 4. Ce qui existe aujourd'hui

### 4.1 Flux de données

```
Montre Garmin → Garmin Connect → intervals.icu → (HTTP Basic, clé API) → src/lib/intervals/client.ts
   → POST /api/sync/activities (bouton « Synchroniser », 1 à 52 semaines, courses uniquement)
   → table synced_activities
   → à l'ouverture d'une activité : GET /activity/{id} + /intervals (laps), cache 24 h dans activity_details_cache
   → onglet « Courbes » : streams à la demande (stream-client.ts), résumés d'efforts stockés dans activity_stream_summaries
   → bouton « Analyser » : context.ts construit un JSON (métriques, seuil, zones, séances comparables, verdict)
   → gemini-client.ts → réponse validée par Zod → table analyses
```

Seules les courses sont synchronisées (`isSupportedRunningActivity`). Les autres sports existent dans
la source mais sont ignorés. Aucun appel au navigateur vers intervals.icu ni Gemini : tout passe par
le serveur, ce qui est conforme aux règles.

### 4.2 Modèle de données (SQLite, `src/lib/db/schema.ts`)

| Table | Rôle | Couplage intervals |
|---|---|---|
| `synced_activities` | Résumé de chaque course (distance, durée, allure, FC, cadence, puissance, charge) | `intervals_activity_id` unique |
| `activity_details_cache` | JSON brut détail + intervalles, TTL 24 h | `intervals_activity_id`, `intervals_json` |
| `activity_stream_summaries` | Meilleurs efforts 3/5/10/20/30 min issus des streams | `intervals_activity_id` |
| `activity_contexts` | Ressenti saisi par l'utilisateur (RPE, fatigue, douleur, note) | `intervals_activity_id` |
| `analyses` | Débrief LLM + métriques + prompt_version | `intervals_activity_id` |
| `action_items` | Actions issues d'une analyse (vide, jamais alimentée) | via `analyses` |
| `manual_sessions` | Séances saisies à la main (muscu, natation, mobilité, autre) | non |
| `athlete_context_versions` | Contexte athlète versionné (JSON) | non |
| `goals` | Objectifs structurés (vide aujourd'hui) | non |
| `conversation_threads` / `conversation_messages` | Assistant conversationnel | non |
| `user_confirmations` | Confirmations de détection (prévu, peu utilisé) | non |

Contenu actuel : 22 courses (07/06 → 22/09/2026, 185 km), 8 détails en cache, 21 résumés de streams,
11 analyses, 1 séance manuelle, 0 objectif, 2 versions de contexte, 5 conversations, 9 messages.
Les dépôts (`src/lib/db/repositories`) forment déjà une abstraction de stockage propre.

### 4.3 Écrans

| Écran | Contenu | Jugement |
|---|---|---|
| `/` Tableau de bord | Accroche éditoriale, calendrier semaine/mois, volume des 12 dernières semaines, 5 tuiles (km, sorties, km/sem…), liste d'activités, séances manuelles | Visuellement soigné (typographie, palette crème/orange), mais c'est un journal : aucune suggestion, aucune tendance, KPIs pauvres (« 0,4 sortie/semaine » à cause des données périmées). À refaire. |
| `/activities/[id]` | 4 métriques, débrief IA, verdict, recommandations, allure cible, onglets Résumé/Intervalles/Courbes, formulaire de ressenti | Le plus abouti. Trop de texte, avertissements techniques exposés (« Estimation de seuil peu fiable… Efforts écartés : 3 min (FC relative 88 %) »). À garder comme base, à alléger fortement. |
| `/context` | Contexte athlète versionné, objectifs, profil de performance | Utile fonctionnellement. À simplifier. |
| `/assistant` | Chat guidé par les données, suggestions de questions | Squelette correct, réponses Gemini. À rebrancher sur Claude. |

### 4.4 Où Gemini est appelé

- `src/lib/llm/gemini-client.ts` : seul point d'appel (`GoogleGenAI.models.generateContent`, sortie JSON
  imposée par `responseJsonSchema`, 3 réessais 2/5/10 s). Deux usages : `analyze()` (débrief) et la
  conversation.
- Routes appelantes : `src/app/api/activities/[id]/analysis/route.ts`,
  `src/app/api/conversations/route.ts`, `src/app/api/conversations/[id]/messages/route.ts`.
- `src/lib/llm/schemas.ts` contient les schémas de sortie Zod (réutilisables) et quelques références
  à Gemini dans les noms ou commentaires.

---

## 5. Accès Garmin : ce que vaut la clé fournie

### 5.1 Constat

Variables présentes dans `.env.local` (valeurs non affichées) : `INTERVALS_API_KEY`,
`INTERVALS_ATHLETE_ID`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GARMIN_API_KEY`, `DATABASE_URL`.

`GARMIN_API_KEY` fait 133 caractères et a la forme `PRÉFIXE_<uuid>.<uuid>.<43 car.>.<10 car.>`.
Ce n'est ni un couple consumer key/secret OAuth 1.0a (format de l'ancien programme développeur
Garmin), ni un JWT OAuth2 comme ceux émis par la connexion Garmin Connect.

Appels de test en lecture seule (en-tête `Authorization: Bearer`) :

| Endpoint | Réponse |
|---|---|
| `apis.garmin.com/wellness-api/rest/user/id` (API officielle Health) | 401 « Unauthorized Request » |
| `apis.garmin.com/wellness-api/rest/activities` | 401 « Unauthorized Request » |
| `apis.garmin.com/userPermissions` | 500, la passerelle échoue à décoder le jeton en base64 |
| `connectapi.garmin.com/userprofile-service/socialProfile` (API Garmin Connect) | 401 « Token is not active » |

**Conclusion : en l'état, cette clé ne donne accès à aucune donnée Garmin.** L'origine exacte de la
clé n'est pas identifiable depuis sa forme seule. Seul Bastien peut dire d'où elle vient.

### 5.2 Options réalistes

| Option | Ce qu'elle donne | Contraintes | Verdict |
|---|---|---|---|
| **A. Programme officiel Garmin Connect Developer** (Activity API + Health API) | Activités, fichiers FIT avec streams et laps, sommeil, HRV, stress, Body Battery, VO2max selon les cas | Candidature à faire auprès de Garmin, accordée surtout aux entreprises ; flux « push/ping » qui exige une URL HTTPS publique (incompatible avec un site purement local sans tunnel) ; profondeur de rattrapage historique limitée | Bonne cible pour « passer à l'échelle », mauvaise pour démarrer seul en local |
| **B. API non officielle Garmin Connect** (bibliothèques `garth` / `python-garminconnect`, ou équivalent Node) avec le login Garmin de Bastien | Quasi tout ce que montre l'app Garmin Connect : liste d'activités, détails, laps, streams, FIT d'origine, sommeil, HRV, Body Battery, training status/load, VO2max, tout l'historique | Non officiel, contraire aux conditions d'usage de Garmin, peut casser à tout changement côté Garmin ; connexion initiale par identifiant + mot de passe + MFA saisis par Bastien lui-même dans un terminal, jetons stockés localement (~1 an) | **Recommandé pour l'usage perso local**, derrière une interface de source pour pouvoir changer plus tard |
| **C. Export de données Garmin** (demande d'export complet du compte) ou fichiers FIT copiés depuis la montre | Tout l'historique en FIT, y compris avant août 2025 | Manuel, pas de mise à jour continue | Utile en complément pour l'historique initial |
| **D. Garder intervals.icu comme source** | Fonctionne aujourd'hui (vérifié : 200), activités + wellness (HRV, sommeil, FC repos, VO2max, CTL/ATL) | Contraire au souhait d'éliminer l'intermédiaire | Solution de repli immédiate pendant la mise en place de B |

Recommandation : définir une interface `ActivitySource` / `WellnessSource`, implémenter B en premier,
garder D comme adaptateur de repli et de test tant que B n'est pas validé, et prévoir A plus tard.
Pour B, il faudra une action de Bastien (se connecter une fois à Garmin dans un terminal) ; aucun
identifiant ne doit transiter par Claude.

---

## 6. Faire tourner Claude en local sans clé API

### 6.1 État de la machine (vérifié)

- `claude` 2.1.266 installé globalement (`/usr/local/bin/claude`, paquet `@anthropic-ai/claude-code`).
- `claude auth status` : connecté, méthode `claude.ai`, abonnement **Pro**. Aucune `ANTHROPIC_API_KEY`.
- Le SDK Agent TypeScript (`@anthropic-ai/claude-agent-sdk`) n'est pas installé dans le projet.
- Test réel : `claude -p "<séance>" --output-format json --tools "" --json-schema '<schéma>'` lancé hors
  session Claude Code → succès, `structured_output` conforme au schéma, 3,4 s, modèle `claude-sonnet-5`.
  (Le coût affiché par le CLI est indicatif ; l'usage est décompté de l'abonnement, pas facturé.)
- Attention : `--bare` désactive la connexion claude.ai et exige une clé API. Ne pas l'utiliser.

### 6.2 Options

| Option | Principe | Avantages | Limites |
|---|---|---|---|
| **1. Lancer `claude -p` depuis une route serveur** (`child_process.spawn`) | Le serveur Next.js passe le contexte JSON sur stdin, `--json-schema` impose la forme, on valide ensuite avec Zod | Zéro dépendance, déjà testé | Démarrage d'un processus par appel (~3-10 s), gestion d'erreurs à la main |
| **2. SDK Agent TypeScript** (`@anthropic-ai/claude-agent-sdk`) | Le SDK pilote le même CLI et réutilise sa connexion claude.ai | API propre, streaming, outils personnalisés (ex. un outil « chercher des séances comparables » branché sur SQLite) : permet un vrai agent coach qui va chercher ses preuves | Une dépendance de plus ; mêmes limites d'usage que l'option 1 |
| 3. API Anthropic avec clé | Appels HTTP directs | Rapide, prévisible | Payant, explicitement exclu pour l'instant |

**Recommandation : option 2**, avec un adaptateur `LlmProvider` pour que le passage futur à une clé
API ne change qu'une configuration (le SDK accepte `ANTHROPIC_API_KEY` sans changer le code).

Limites à connaître :
- Quotas Pro par fenêtre de 5 heures et par semaine, partagés avec l'usage interactif de Claude Code.
  Il faut donc mettre en cache les débriefs (déjà fait via la table `analyses`) et ne pas les relancer
  automatiquement à chaque synchro.
- L'accès aux modèles Opus dépend du plan ; Sonnet est le défaut constaté. À confirmer à l'usage.
- Utiliser la connexion claude.ai convient à un usage personnel local ; pour un produit ouvert à
  d'autres utilisateurs, il faudra une clé API.
- Le serveur doit tourner sur la machine où `claude` est connecté (cohérent avec un site local).
- Lancer le processus avec un environnement propre, sans outils (`tools: []` ou `--tools ""`), sans
  charger les réglages du projet, pour éviter qu'il lise ou modifie des fichiers.

---

## 7. Données réelles de Bastien (via intervals.icu, lecture seule)

| Indicateur | Valeur |
|---|---|
| Activités | 122, du 26/08/2025 au 13/11/2026, toutes issues de Garmin Connect |
| Par sport | Course 91 · Natation 10 · Rando 8 · Vélo 6 (+1 virtuel) · Muscu 2 · Ski de rando 2 · Surf 2 |
| Par année | 2025 (sept.-déc.) : 43 dont 31 courses · 2026 : 79 dont 60 courses |
| Course | 895 km au total |
| 90 derniers jours | 18 courses, 3 natations, 1 rando, 1 vélo |
| FC | présente sur 100 % des activités |
| Puissance | absente partout |
| Wellness (30 derniers jours) | CTL/ATL/rampe 31 j, HRV 29 j, sommeil (durée, score, qualité) 29 j, FC repos 30 j, pas 30 j, VO2max 7 j |

L'historique commence le 26/08/2025, ce qui correspond très probablement à la date de connexion
d'intervals.icu et non au début des données Garmin. Une connexion Garmin directe (option B) ou un
export (option C) permettrait sans doute de remonter plus loin.

Conséquences pour le produit :
- La course est le sport principal (~75 %) ; le dashboard doit être centré course mais afficher les
  autres sports dans le volume et le calendrier.
- Environ 1,4 course par semaine en moyenne depuis 15 mois (6 par mois sur les 90 derniers jours) :
  le pool de « séances comparables » sera petit, surtout par type de séance. Il faut des critères de
  comparabilité tolérants et toujours afficher le nombre de séances comparées.
- Pas de puissance : les analyses reposent sur allure, FC, cadence, dénivelé.
- HRV, sommeil et FC repos sont disponibles. Leur usage doit rester factuel (affichage de tendances)
  pour respecter la frontière médicale de l'ADR-004 (pas de score de fatigue ou de readiness).

---

## 8. Garder, réécrire, supprimer

### À garder (en adaptant les identifiants)

- `src/lib/analysis/*` : segmentation, rôles de segments, signature de séance, profil de variation,
  régularité, verdict, zones, seuil dynamique, résumé de streams, et leurs tests. C'est le cœur de la
  comparaison avec des séances comparables. À adapter : identifiant d'activité générique, `now` injecté.
- `src/lib/db/repositories/*` et l'approche Drizzle + migrations.
- `src/lib/llm/schemas.ts` et `context.ts` (construction du contexte JSON et validation Zod), une fois
  débarrassés des références Gemini/intervals.
- `src/lib/dashboard/calendar.ts` et `volume.ts` (à étendre au multisport).
- `src/lib/formatters.ts`, la charte visuelle de `globals.css` comme point de départ.
- Les tables `athlete_context_versions`, `goals`, `activity_contexts`, `manual_sessions`, `conversation_*`.
- AGENTS.md, ADR-004 (frontière médicale) et ADR-007 (posture de coach), à mettre à jour.

### À réécrire

- La couche source : remplacer `src/lib/intervals/*` par une interface de source et un adaptateur
  Garmin (et un adaptateur intervals.icu de repli).
- Le schéma : `intervals_activity_id` → `source` + `source_activity_id` (6 tables), ajout du
  multisport et des données wellness quotidiennes.
- Le client LLM : `gemini-client.ts` → adaptateur Claude (SDK Agent), prompts réécrits.
- Le dashboard `/` : suggestion de prochaine séance et indicateur de progression en tête.
- La page activité : débrief plus court, structuré, sans jargon interne.
- Mapper : correction de la cadence.

### À supprimer

- `@google/genai` et `@google/generative-ai` (le second n'est même pas utilisé).
- Variables `GEMINI_API_KEY`, `GEMINI_MODEL` (et `INTERVALS_*` si l'adaptateur de repli n'est pas gardé).
- `trainer_copilot_save.json`, `copilot_summary.md`, `clean_copilot.py`, `.DS_Store` (à retirer de Git).
- ADR-002 (« Intervals.icu comme source de vérité ») à remplacer par un nouvel ADR sur Garmin.
- `docs/05-intervals-integration.md` et `docs/17-intervals-local-sync.md` à archiver.
- Les 11 analyses Gemini stockées (formats obsolètes, à régénérer avec Claude).

### Inventaire des points de couplage

Intervals.icu (33 fichiers hors tests) :
- Client et mapping : `src/lib/intervals/{client,schemas,mapper,stream-client,stream-mapper,sync}.ts`
- Base : `src/lib/db/schema.ts`, `contracts.ts`, et les dépôts `synced-activity`, `activity-detail-cache`,
  `stream-summary`, `activity-context`, `analysis`
- Analyse : `segmentation.ts`, `threshold-basis.ts`, `performance-profile.ts`,
  `performance-profile-recalc.ts`, `types.ts`
- LLM : `context.ts`, `conversation-context.ts`, `schemas.ts`
- Activités et dashboard : `src/lib/activities/detail.ts`, `src/lib/dashboard/calendar.ts`
- Routes : `api/sync/activities`, `api/activities`, `api/activities/[id]`, `.../streams`,
  `.../context`, `.../analysis`, `api/performance-profile/recalculate`
- UI : `src/app/page.tsx`, `activity-detail.tsx`, `activity-list.tsx`, `performance-profile-panel.tsx`
- Docs : README, AGENTS.md, ADR-002, docs 03, 04, 05, 15, 17, 21

Gemini (5 fichiers) : `src/lib/llm/gemini-client.ts`, `src/lib/llm/schemas.ts`,
`src/app/api/activities/[id]/analysis/route.ts`, `src/app/api/conversations/route.ts`,
`src/app/api/conversations/[id]/messages/route.ts`, plus `package.json`, `.env.example`, README,
docs 07, AGENTS.md (« Google GenAI SDK pour Gemini » dans la stack obligatoire).

---

## 9. Risques et inconnues

| Risque | Impact | Parade |
|---|---|---|
| Accès Garmin : la clé fournie ne marche pas, l'API officielle demande une candidature et une URL publique | Bloque le pivot « sans intermédiaire » | Option B (non officielle) derrière une interface ; intervals.icu en repli ; demander à Bastien l'origine de la clé |
| API non officielle Garmin instable ou bloquée | Synchro cassée sans prévenir | Adaptateur isolé, tests sur fixtures, repli intervals.icu, import FIT |
| Quotas Claude Pro partagés | Débriefs refusés en pleine session de travail | Cache, déclenchement manuel, file d'attente, message clair dans l'UI |
| Latence Claude (plusieurs secondes) | UX d'attente | Génération en arrière-plan après synchro, état « en cours » |
| Peu de séances comparables (1,4 course/semaine) | Comparaisons et seuil peu fiables | Critères tolérants, nombre de séances affiché, repères déclarés en complément |
| Historique limité à 15 mois via intervals.icu | Indicateur de progression court | Récupérer l'historique complet via Garmin ou export |
| Travail non commité sur `main` | Base de départ ambiguë pour les threads | Commiter l'état actuel avant toute implémentation |
| Frontière médicale avec HRV/sommeil | Glissement vers un score de fatigue | Affichage factuel uniquement, règle explicite dans les prompts et tests |

Inconnues qui demandent Bastien : l'origine de `GARMIN_API_KEY`, et son accord pour l'option B
(connexion avec son compte Garmin, faite par lui-même dans un terminal).

---

## 10. Ordre de dépendance proposé pour l'implémentation

1. **Socle** (aucune dépendance) : commiter l'état actuel, corriger le test d'horloge et la cadence,
   retirer les fichiers parasites, mettre à jour AGENTS.md et les ADR (Garmin, Claude local).
2. **Abstraction de source + migration du schéma** : `source`/`source_activity_id`, multisport,
   table wellness quotidienne. L'adaptateur intervals.icu existant est branché sur l'interface pour
   garder une app fonctionnelle.
3. **En parallèle de 2 et 4 :**
   - 3a. **Adaptateur Garmin** (option B) : connexion unique par Bastien, synchro activités + laps +
     streams + wellness, rattrapage de tout l'historique.
   - 3b. **Adaptateur Claude local** (SDK Agent) : `LlmProvider`, sortie structurée validée par Zod,
     cache, gestion des quotas.
4. **Moteur d'analyse étendu** (dépend de 2) : séances comparables multicritères, indicateur de
   progression (tendance allure à FC donnée, volume, régularité), règles de suggestion de prochaine
   séance calculées de façon déterministe avant toute rédaction par Claude.
5. **Agent coach** (dépend de 3b et 4) : prompts de débrief et de suggestion, outils de recherche de
   séances comparables, conversation.
6. **Nouveau dashboard et page activité** (dépend de 4, maquettable dès 2 avec des données intervals) :
   suggestion de prochaine séance et indicateur de progression en tête, KPIs, multisport.
7. **Retrait de Gemini et d'intervals.icu** (dépend de 3a et 5 validés), puis recette par Bastien.
