# Frontière des séances manuelles

`manual_sessions` contient exclusivement les séances non-course saisies par
l'utilisateur : musculation, natation, mobilité ou autre.

Ces séances servent au calendrier et à la visualisation uniquement. Elles sont
exclues par conception de :

- tout volume de course ;
- toute analyse de course ;
- toute comparaison historique de course ;
- toute tendance de course ;
- tout futur contexte envoyé à un LLM.

Les activités Intervals.icu restent dans `synced_activities` et sont la seule
source future des analyses de course. Un service de calendrier pourra plus tard
fusionner les deux listes dans un type de présentation explicite et en lecture
seule ; cette fusion ne doit jamais modifier les sources ni leurs règles d'accès.

La date manuelle est locale et stricte (`YYYY-MM-DD`). Elle n'est jamais convertie
en timestamp UTC.