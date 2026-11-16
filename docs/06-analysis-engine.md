
# Moteur d'analyse

## Principe

Le moteur produit des métriques observables.
Il ne doit pas produire d'interprétation médicale ou non vérifiable.

Ce document couvre les métriques déterministes de base. L'estimation
dynamique des seuils, la classification en zones et la normalisation
`% de l'allure seuil` qui alimentent la comparaison historique sont
décrites dans `docs/22-dynamic-thresholds-and-zones.md`.

## Métriques déterministes

### Activité globale

- distance
- durée
- allure moyenne
- fréquence cardiaque moyenne et maximale
- cadence moyenne
- dénivelé
- température si disponible

### Intervalles

- nombre d'intervalles
- durée et distance par intervalle
- allure moyenne et médiane
- fréquence cardiaque moyenne et maximale
- cadence moyenne
- récupération entre intervalles

### Régularité

- écart type et coefficient de variation de l'allure
- différence entre première et dernière répétition
- différence entre première moitié et seconde moitié
- évolution de la cadence
- évolution de la fréquence cardiaque

### Qualité des données

- données manquantes
- pauses
- GPS instable
- FC absente ou incohérente
- laps insuffisants pour une comparaison

## Comparaison historique

Implémentée dans `src/lib/llm/context.ts`
(`buildHistoricalComparisonForActivity`, `buildHistoricalComparisonForWorkout`,
`toComparableActivitiesHistory`) et `src/lib/analysis/session-signature.ts`
(`buildSessionSignature`, `computeComparability`, `getWorkRepBucket`), avec
`src/lib/analysis/segment-roles.ts` (rôles warmup/work/recovery/cooldown) et
`src/lib/analysis/variation-profile.ts` (profil de variation) comme
dépendances. Elle produit toujours l'objet `historicalComparisonSchema` :
`comparableActivitiesCount`, `recentTrendDays`, `insufficientDataReason`,
`paceDeltaPct`, `hrDeltaBpm`, `cadenceDeltaSpm`, `observations`,
`usedDeclaredReferenceFallback`, `comparabilityBreakdown`.

### Vivier de candidats

Uniquement `synced_activities`, sur les **90 derniers jours**, au plus
**20 activités** (`findByPeriod`). `manual_sessions` n'est jamais consulté.
Pour le mode structuré (ci-dessous), un candidat n'est **mesuré** (et donc
comparable) que si son détail est déjà en cache local
(`activity_details_cache`, alimenté par la consultation de l'activité ou un
débrief antérieur) — aucun nouveau fetch n'est déclenché pour construire le
pool de comparaison. Un candidat sans cache est explicitement exclu, jamais
approximé.

### Base de vitesse de référence (3 cas)

`resolveComparisonThresholdSpeedMps` résout, une seule fois par débrief, la
vitesse utilisée pour le `% de seuil` — identique pour la séance courante et
tous les candidats :
1. seuil dynamique exploitable (`criticalSpeedMps` non nul, confiance ≠
   `insufficient`) ;
2. seuil dynamique insuffisant mais référence de performance déclarée
   exploitable (`src/lib/analysis/declared-reference.ts` — uniquement un
   texte au format d'allure `m:ss/km` reconnu strictement, jamais une
   valeur devinée) : `usedDeclaredReferenceFallback` passe à `true`, jamais
   présenté comme une estimation automatique, tier de comparabilité
   plafonné à `moderate` ;
3. ni l'un ni l'autre : la comparaison structurée **ne s'exécute pas** —
   `comparableActivitiesCount: 0` avec une raison explicite. Ce cas ne
   retombe jamais silencieusement sur le mode continu ci-dessous pour une
   séance réellement structurée.

### Deux modes, choisis à partir de cette résolution

Le mode dépend de la présence de **segments de travail** (rôle `work`,
`segment-roles.ts`) une fois la vitesse de référence ci-dessus appliquée —
et non plus du seul seuil dynamique brut, pour qu'une référence déclarée
puisse elle aussi révéler une structure que le seuil dynamique seul ne
verrait pas.

**Mode séance structurée** — au moins un segment `work`.

- Chaque séance (courante et candidats mesurés) reçoit une **signature**
  (`buildSessionSignature`) : nombre et durée moyenne des segments `work`,
  bucket de durée (`getWorkRepBucket` : `short` < 90 s, `medium` 90–240 s,
  `long` > 240 s), zone dominante (calculée sur cette séance, jamais
  copiée), `% de l'allure seuil` moyen, nombre/durée des segments
  `recovery`, ratio travail/récupération, dénivelé, et profil de variation
  (`variation-profile.ts`).
- `computeComparability` calcule un score pondéré (zone 30 %, bucket de
  durée 20 %, nombre de répétitions 15 %, volume de travail 15 %,
  similarité de récupération 20 %), puis deux garde-fous plafonnent le tier
  à `moderate` sans l'annuler : ratio travail/récupération très différent,
  ou dénivelé par km très différent. Tiers : `high` (score ≥ 0,75),
  `moderate` (≥ 0,5), `excluded` (< 0,5, hors du pool).
- Les comparables retenues sont triées par tier puis par récence ;
  `paceDeltaPct` = écart relatif entre le `% de l'allure seuil` de la
  séance et celui de la comparable la plus récente et la mieux notée. La
  moyenne historique est exposée dans `observations`, ainsi que le détail
  par candidat (`comparabilityBreakdown`) pour la transparence
  méthodologique (niveau 3 de l'UI).
- `hrDeltaBpm` et `cadenceDeltaSpm` restent `null` dans ce mode.
- `insufficientDataReason` : renseigné si 0 comparable mesuré (comparaison
  non fiable — avec un message distinct si des candidats existent mais ne
  sont pas encore en cache local) ou si une seule comparable (interprétation
  prudente).
- `recentTrendDays` = 112.

**Mode séance continue** — aucun segment `work` (repli).

- Une candidate est comparable si : distance et durée présentes, sport
  `run`/`running`, ratio de distance ≥ 0,7 et ratio de durée ≥ 0,7
  (min/max).
- `paceDeltaPct` = écart relatif, en %, entre la vitesse moyenne de la
  séance et la **moyenne** des vitesses historiques comparables.
- `hrDeltaBpm` et `cadenceDeltaSpm` restent `null`.
- `insufficientDataReason` : renseigné si 0 comparable, ou si moins de
  3 comparables (écart historique faible, à interpréter avec prudence).
- `recentTrendDays` = 90.

La logique est explicite et testée (`src/lib/llm/context.test.ts`,
`src/lib/analysis/session-signature.test.ts`,
`src/lib/analysis/segment-roles.test.ts`,
`src/lib/analysis/variation-profile.test.ts`,
`src/lib/analysis/declared-reference.test.ts`).

## Résumé de streams et profil de performance

`stream-summary.ts` calcule, à partir des streams normalisés d'une activité,
un résumé dérivé : meilleur effort glissant pour 180/300/600/1200/1800 s
(allure + FC moyenne) et un compteur d'échantillons. Aucune série brute,
aucune donnée de localisation. Il est écrit dans `activity_stream_summaries`
(upsert par `(intervals_activity_id, stream_version)`) à l'ouverture de
l'onglet Courbes et lors du recalcul du profil.

`threshold-basis.ts` (`aggregateCachedEfforts`) agrège ces résumés — meilleur
point par durée de référence, dans une fenêtre de `ESTIMATE_WINDOW_WEEKS`
(20 semaines), avec la date de l'activité source. Cette base sert **à la
fois** :

- au **profil de performance** (`performance-profile.ts`) : + tendance de
  volume de course sur 12 semaines + `key_takeaways` des 5 activités
  distinctes les plus récemment analysées (déduplication par
  `intervals_activity_id`, la plus récente comptant — une analyse régénérée ne
  crée pas de doublon ; la lecture est bornée à `LIMIT 20` pour ne pas
  matérialiser tous les blobs `llm_response_json`, choix préféré à un
  `GROUP BY`). Calcul à la demande via `GET /api/performance-profile` ;
  `POST /api/performance-profile/recalculate` comble les résumés manquants
  sur une fenêtre bornée, séquentiellement, en respectant `Retry-After` ;
- au **débrief d'une activité** (`buildActivityAnalysisContext`) : le
  `thresholdEstimate` de ce débrief provient du même cache et de la même
  fenêtre. Aucun fetch de streams n'est déclenché depuis le débrief ; si le
  cache est insuffisant, la confiance reste `insufficient`. Le débrief calcule
  la base **une seule fois** et la passe à `buildPerformanceProfile`
  (paramètre `precomputedBasis`) : pas de double agrégation dans la même
  requête. La provenance (`basis`, `windowWeeks`, `retainedPoints`,
  `usedDeclaredReferenceFallback`, `staleWarning` chiffré) est transmise au
  LLM et renvoyée à l'UI (cf. `docs/22`, `docs/09`).

Aucun score de charge/fatigue. `manual_sessions` n'est jamais lue.
