
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
(`buildHistoricalComparisonForWorkout`, `toComparableActivitiesHistory`,
`getWorkRepBucket`). Elle produit toujours l'objet
`historicalComparisonSchema` : `comparableActivitiesCount`,
`recentTrendDays`, `insufficientDataReason`, `paceDeltaPct`, `hrDeltaBpm`,
`cadenceDeltaSpm`, `observations`.

### Vivier de candidats

Uniquement `synced_activities`, sur les **90 derniers jours**, au plus
**20 activités** (`findByPeriod`). `manual_sessions` n'est jamais consulté.

### Deux modes, choisis automatiquement

Le mode dépend de la présence de **segments de travail** dans la séance
analysée : segments classés `tempo`, `threshold`, `vo2max` ou `anaerobic`
(cf. `docs/22`).

**Mode séance à intervalles** — au moins un segment de travail et une
moyenne de `% de l'allure seuil` calculable.

- La séance est résumée par : moyenne du `% de l'allure seuil` sur les
  segments de travail, **zone dominante** (zone la plus fréquente parmi
  ces segments), durée moyenne des segments de travail, nombre de
  segments de travail.
- **Bucket de durée de répétition** (`getWorkRepBucket`) :
  `short` < 90 s, `medium` 90–240 s, `long` > 240 s.
- Une activité candidate est comparable si : même zone dominante (quand
  les deux sont connues), même bucket de durée (quand les deux sont
  connus) et au moins un segment de travail.
- Les comparables sont triées de la plus récente à la plus ancienne.
- `paceDeltaPct` = écart relatif, en %, entre le `% de l'allure seuil` de
  la séance et celui de **la comparable la plus récente**. La moyenne
  historique du `% de l'allure seuil` est aussi calculée et exposée dans
  `observations`.
- `hrDeltaBpm` et `cadenceDeltaSpm` restent `null` dans ce mode.
- `insufficientDataReason` : renseigné si 0 comparable (comparaison non
  fiable) ou si une seule comparable (interprétation prudente).
- `recentTrendDays` = 112.

**Mode séance continue** — aucun segment de travail (repli).

- Une candidate est comparable si : distance et durée présentes, sport
  `run`/`running`, ratio de distance ≥ 0,7 et ratio de durée ≥ 0,7
  (min/max).
- `paceDeltaPct` = écart relatif, en %, entre la vitesse moyenne de la
  séance et la **moyenne** des vitesses historiques comparables.
- `hrDeltaBpm` et `cadenceDeltaSpm` restent `null`.
- `insufficientDataReason` : renseigné si 0 comparable, ou si moins de
  3 comparables (écart historique faible, à interpréter avec prudence).
- `recentTrendDays` = 90.

La logique est explicite et testée (`src/lib/llm/context.test.ts`).

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
