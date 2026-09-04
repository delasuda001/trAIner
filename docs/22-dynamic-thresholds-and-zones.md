
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

## Filtrage des points valides

Un point n'est retenu pour la régression que s'il satisfait deux critères :

1. **Intensité minimale relative** : la FC moyenne de l'effort doit dépasser
   un pourcentage de la FC max observée, décroissant avec la durée
   (ex. 90 % à 3 min, jusqu'à 78 % à 30 min).
2. **Plausibilité de dégradation** : la perte de vitesse par rapport au
   dernier point validé de durée inférieure ne doit pas dépasser la
   dégradation attendue par un modèle de fatigue standard (exposant proche
   de 0,075), au-delà d'une tolérance définie. Un écart plus important
   signale un effort non maximal (ex. meilleur segment d'une sortie facile),
   qui est rejeté plutôt qu'utilisé.

Les points rejetés sont conservés avec leur motif et remontés comme
avertissement, jamais silencieusement ignorés.

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
Daniels/Coggan :

- Récupération : < 75 % de l'allure seuil (vitesse)
- Base/Endurance : 75-88 %
- Tempo : 88-95 %
- Seuil : 95-102 %
- VO2max : 102-115 %
- Anaérobie/Répétition : > 115 %

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
