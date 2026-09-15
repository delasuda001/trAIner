
# Estimation dynamique des seuils et classification en zones

## Principe

L'allure et la FC de seuil ne sont jamais lues depuis des champs propriétaires
Intervals.icu (`threshold_pace`, `icu_hr_zones`, etc.) ni saisies manuellement
par défaut. Elles sont calculées localement à partir des streams bruts
(temps, distance, fréquence cardiaque) des activités de course récentes, afin
de rester portables vers toute future source de données (ex. API Garmin
directe).

## Méthode

Modèle de vitesse critique à deux paramètres (distance = CS × temps + D'),
ajusté par régression linéaire sur les meilleurs efforts glissants observés
pour un ensemble de durées de référence : 3, 5, 10, 20 et 30 minutes.

Ces meilleurs efforts proviennent des résumés de streams en cache
(`activity_stream_summaries`, cf. `docs/15`) : `stream-summary.ts` extrait,
par activité, la fenêtre la plus rapide pour chaque durée de référence (+ FC
moyenne). L'agrégation est centralisée dans `threshold-basis.ts`
(`aggregateCachedEfforts`) et sert **à la fois** au profil de performance
(`performance-profile.ts`) et au débrief d'une activité
(`buildActivityAnalysisContext`) : les deux estiment le seuil à partir du
même cache et de la même fenêtre. Le filtrage d'intensité et de plausibilité
ci-dessous n'est donc pas dupliqué : il s'applique sur ces points agrégés.

### Fenêtre temporelle d'agrégation

`ESTIMATE_WINDOW_WEEKS = 20` (≈ 5 mois). Valeur choisie avec l'utilisateur
dans la fourchette 16–24 semaines ; elle vise à couvrir un bloc
d'entraînement complet sans laisser un très vieux record dominer
l'estimation courante. Un résumé de streams ne participe à l'estimation
**active** que si l'activité source débute dans les 20 dernières semaines ;
les résumés plus anciens restent en cache mais sont ignorés, même s'ils
correspondent à un effort plus rapide. Chaque meilleur effort retenu conserve
la date de son activité source (traçabilité, affichée dans le profil et
transmise au LLM via `thresholdEstimate.retainedPoints`).

#### Interaction avec la fenêtre de fraîcheur (8 semaines)

`ESTIMATE_WINDOW_WEEKS` (20) est volontairement plus large que
`FRESHNESS_WINDOW_S` (8 semaines). Conséquences :

- `freshnessAlert` (booléen) n'est levé que si **aucun** point retenu n'a
  moins de 8 semaines (ou si aucun point n'est retenu).
- Le cas de **fraîcheur mixte** (un point récent + un point de 10–20
  semaines) ne lève donc pas `freshnessAlert`, alors que l'ancrage long du
  modèle peut être vieux. Pour ne pas donner une fausse impression de
  fraîcheur, `ThresholdEstimate` expose en plus :
  - `stalePointCount` : nombre de points retenus datant de plus de 8 semaines ;
  - `oldestRetainedPointWeeks` : âge du plus ancien point retenu.
  Ces deux champs nourrissent `staleWarning.message` (en français) même quand
  `isStale` est `false`. Le message est aussi repris dans `limitations` par
  le débrief.

Décision : garder les deux seuils tels quels (20 / 8) et compenser par la
nuance chiffrée ci-dessus, plutôt que de les rapprocher.

### Provenance transmise au débrief et à l'UI

`thresholdEstimate` porte : `basis: "recent_history"` (toujours),
`windowWeeks`, `retainedPoints` (activités + dates des points retenus),
`usedDeclaredReferenceFallback` (true si confiance `insufficient`/`low` **et**
au moins une référence de performance déclarée dans le contexte athlète). Le
prompt système impose alors au modèle de dire explicitement, dans
`zone_classification_summary`, que le seuil vient de l'historique récent
multi-séances — et, si le flag est vrai, de classer les zones sur la référence
déclarée en le précisant. La route `/api/activities/[id]/analysis` renvoie un
sous-ensemble de ce bloc (`thresholdPaceMinKm`, `confidenceLevel`,
`staleWarning`, `missingZones`, `windowWeeks`, `retainedPoints`,
`usedDeclaredReferenceFallback`, `biasHint`, `suggestedSessions`,
`rejectedPoints`) que `AnalysisPanel` affiche.

**Péremption indépendante de la confiance.** `staleWarning` porte
`stalePointCount` (points retenus de plus de 8 semaines) et
`oldestRetainedPointWeeks`. `buildThresholdStaleMessage`
(`analysis/confidence-banner.ts`) compose un message français à partir de ces
champs, affiché **dès que `stalePointCount > 0`, quelle que soit la
confiance** — en note neutre (pas le bandeau alarmant), dans
`ThresholdProvenance` (débrief) comme sur la page profil
(`performanceProfileSchema.thresholdStaleMessage`). C'est ce qui couvre le cas
« confiance bonne mais ancrage tempo/long périmé » : sans ça, un
`freshnessAlert` à `false` (un seul point récent suffit) laissait croire à une
estimation entièrement fraîche. Les seuils 20 / 8 semaines et
`assessConfidenceLevel` sont inchangés. La décision d'affichage est isolée
dans `selectConfidenceBannerState` (`analysis/confidence-banner.ts`),
consommée par les deux composants et testée (`confidence-banner.test.ts`).

Le débrief d'une activité **ne déclenche aucun fetch de streams** : si le
cache ne contient pas assez de résumés dans la fenêtre, la confiance reste
`insufficient` (comportement inchangé). Les streams ne sont récupérés que
depuis l'onglet Courbes ou le recalcul explicite du profil.

### Trois fenêtres de lookback distinctes (choix assumé)

Le système utilise trois horizons différents, chacun adapté à sa grandeur :

| Usage | Fenêtre | Raison |
| --- | --- | --- |
| Estimation de seuil | 20 semaines | couvrir un bloc d'entraînement ; un record isolé plus vieux ne doit plus peser |
| Tendance de volume (`performance-profile`) | 12 semaines | comparer 4 semaines récentes à 4 semaines précédentes reste lisible et réactif |
| Comparaison historique d'une séance (`context.ts`) | 90 jours (~13 semaines) | trouver des séances vraiment comparables sans remonter trop loin |

Elles ne sont pas harmonisées volontairement : les rapprocher dégraderait au
moins un des trois usages.

### Limites connues du filtrage sur points agrégés

- Le **filtre de plausibilité de dégradation** compare la vitesse d'un point
  à durée D à celle du point valide le plus proche de durée inférieure (voir
  « Filtrage des points valides »). Après agrégation multi-activités, ces deux
  points peuvent provenir de **jours différents** : un très bon effort court
  d'une séance A peut faire rejeter un effort long parfaitement maximal d'une
  séance B comme « dégradation implausible ». Les points rejetés sont remontés
  (jamais silencieux) et affichés effort par effort. L'effet résiduel est un
  **sous-comptage possible de points valides**, donc un biais **vers une
  confiance prudente** (`low`/`insufficient`), jamais vers un nombre inventé
  ou faussement confiant. Le contrôle « remonter jusqu'au dernier point
  réellement valide » corrige le cas où un trou désactivait le filtre pour les
  points longs ; une refonte tenant compte de la dispersion temporelle reste
  un chantier séparé.
- `globalMaxHeartRateBpm` (dénominateur de la porte d'intensité FC) est le
  **maximum sur toutes les activités synchronisées**, pas seulement la
  fenêtre de 20 semaines. Choix assumé : la FC max est un plafond
  physiologique qui n'« expire » pas en 20 semaines. **Risque identifié** :
  un artefact capteur isolé (ex. 230 bpm) dans n'importe quelle activité
  jamais synchronisée relâche durablement la porte d'intensité et peut faire
  passer des efforts non maximaux. Non corrigé (pas de garde-fou percentile
  pour l'instant) ; à surveiller si des points visiblement non maximaux sont
  retenus.

## Filtrage des points valides

Un point n'est retenu pour la régression que s'il satisfait deux critères :

1. **Intensité minimale relative** : la FC moyenne de l'effort doit dépasser
   un pourcentage de la FC max observée, décroissant avec la durée
   (ex. 90 % à 3 min, jusqu'à 78 % à 30 min).
2. **Plausibilité de dégradation** : la perte de vitesse par rapport au
   **point valide le plus proche parmi les durées inférieures** ne doit pas
   dépasser la dégradation attendue par un modèle de fatigue standard
   (exposant proche de 0,075), au-delà d'une tolérance définie. Un écart plus
   important signale un effort non maximal (ex. meilleur segment d'une sortie
   facile), qui est rejeté plutôt qu'utilisé.
   Important : on remonte jusqu'au dernier point **réellement valide**, pas
   seulement à la durée de référence immédiatement précédente. Sinon un trou
   (durée intermédiaire absente du cache ou elle-même rejetée) désactivait
   silencieusement ce contrôle pour les efforts plus longs — un 30 min non
   maximal passait alors et tirait la vitesse critique vers le bas (allure
   seuil affichée plus lente qu'un effort réellement soutenu sur 20–30 min).

Les points rejetés sont conservés avec leur motif et remontés comme
avertissement, jamais silencieusement ignorés. Le profil de performance
(`performanceProfileSchema.bestEfforts[].status` / `rejectionReason`) et le
débrief (`thresholdEstimate.rejectedPoints`) exposent, effort par effort,
lesquels ont été **utilisés** et lesquels ont été **écartés** avec le motif.

## Niveau de confiance et complétude

Trois zones de durée sont définies comme représentatives :
court (VO2max/VMA, 3-5 min), moyen (seuil, 10-20 min), long (tempo, 30 min+).

Le résultat de l'estimation inclut :
- le nombre de points valides retenus ;
- les zones de durée non couvertes par un point valide récent ;
- une suggestion de séance concrète pour combler chaque zone manquante
  (ex. "séance de fractionné court à sensation très difficile" pour combler
  la zone VO2max) ;
- une indication de sens du biais si l'estimation repose sur une
  extrapolation (ex. "basée uniquement sur des efforts courts : l'allure
  seuil réelle est probablement légèrement plus rapide") ;
- une alerte de fraîcheur si tous les points valides datent de plus de
  8 semaines (reprise après pause, évolution de niveau probable).

Niveaux de confiance retenus : `insufficient` (0-1 point), `low` (2 points),
`moderate` (3-4 points), `good` (5 points couvrant les trois zones de durée,
récents).

## Classification en zones

Chaque segment (lap, tiers ou segment adaptatif) est classé selon son allure
moyenne exprimée en pourcentage de l'allure seuil estimée, selon des bornes
fixes documentées dans le code (`lib/analysis/zones.ts`), inspirées des zones
Daniels/Coggan.

Chaque zone a une **valeur d'énumération** (identifiant machine, utilisé
dans `TrainingZone`, `trainingZoneSchema` et `segmentZoneSchema`) et un
**libellé** lisible (`getZoneLabel`). C'est la valeur d'énumération qui est
persistée et validée par Zod ; le libellé n'est qu'un affichage.

| Valeur d'énumération | Libellé              | Bornes (% de l'allure seuil, vitesse) |
| -------------------- | -------------------- | ------------------------------------- |
| `recovery`           | Récupération         | < 75 %                                |
| `easy`               | Base / Endurance     | 75-88 %                               |
| `tempo`              | Tempo                | 88-95 %                               |
| `threshold`          | Seuil                | 95-102 %                              |
| `vo2max`             | VO2max               | 102-115 %                             |
| `anaerobic`          | Anaérobie / Répétition | > 115 %                             |

La valeur d'énumération de la zone d'endurance est `easy` (et non `base`) :
c'est l'identifiant déjà employé partout dans le code et dans les payloads
JSON persistés ; le vocabulaire « base / endurance » reste porté par le
libellé. Le renommer casserait la validation Zod des analyses déjà stockées.

Ces bornes sont des constantes versionnées, jamais une table externe à
maintenir.

## Absence de score de charge

Ce module ne produit ni ne stocke aucune notion de charge cumulée, de
fatigue ou de "readiness". Une seule règle dérivée est autorisée : si la
séance analysée est classée majoritairement en zone Seuil/VO2max/Anaérobie,
le débrief peut mentionner factuellement le caractère intensif de la séance
et suggérer une séance plus légère le lendemain, sans jamais quantifier ou
nommer une "charge" ou une "fatigue".

## Non-objectifs de ce module

- Aucune dépendance à un réglage externe (Intervals.icu ou Garmin).
- Aucun score de charge ou de fatigue.
- Aucune détection médicale.
- Aucune donnée GPS utilisée ou exposée.
