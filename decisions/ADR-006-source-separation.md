# ADR-006 : séparation des sources d'activités

## Contexte

Les courses Intervals.icu sont analysables. Les séances manuelles servent au
calendrier, mais ne doivent pas contaminer les analyses ou tendances de course.

## Décision

Stocker les courses synchronisées exclusivement dans `synced_activities` et les
séances manuelles exclusivement dans `manual_sessions`. Ne pas utiliser une table
commune, une colonne `source` ou un booléen `is_analyzable` comme séparation
principale. Les repositories d'analyse de course ne liront que `synced_activities`.

## Conséquences

La frontière est visible dans le schéma et vérifiable par les tests. Un futur
service de calendrier pourra produire un type de présentation fusionné en lecture
seule, sans transformer les activités manuelles en activités analysables.

## Alternatives écartées

Une table `activities` polymorphe avec une colonne de provenance a été écartée,
car elle rendrait une inclusion accidentelle des séances manuelles trop facile.