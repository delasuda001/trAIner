
# Contexte produit

## Problème

Les outils de sport produisent un grand nombre de métriques mais expliquent
imparfaitement comment une séance s'est déroulée et comment elle se compare
à l'historique personnel de l'athlète.

## Proposition de valeur

Run Insights transforme les données d'une activité de course en :
- constats factuels ;
- comparaison chiffrée à des activités similaires récentes ;
- positionnement de la séance dans les zones d'entraînement (récupération,
  base, tempo, seuil, VO2max, anaérobie), déterminées dynamiquement à partir
  des données personnelles de l'athlète ;
- recommandations techniques concrètes (allure cible ajustée, exercices à
  intégrer) argumentées et sourcées ;
- hypothèses et limites explicites lorsque les données sont insuffisantes.

## Positionnement usage personnel

Run Insights est utilisé dans un cercle restreint par des utilisateurs expérimentés, capables
d'évaluer la pertinence d'un conseil technique et de solliciter un avis
médical externe si nécessaire. L'application n'adopte donc pas une posture
de prudence maximale généraliste : elle privilégie des retours argumentés
et actionnables sur les aspects techniques et d'entraînement.

Une seule catégorie reste strictement hors de portée du LLM, indépendamment
du niveau de l'utilisateur : toute interprétation médicale, toute évaluation
de douleur/blessure, et tout score de charge ou de fatigue globale (l'API
ne fournit pas de données fiables de ce type, et aucun modèle ne peut
raisonnablement les évaluer). Cette limite n'est pas une prudence éditoriale
mais une limite de compétence réelle du système, non négociable même en
usage personnel.

## Utilisateur initial

Un seul utilisateur : le propriétaire de l'application.

## Non-objectifs MVP

- Application multi-utilisateur.
- Coaching médical.
- Détection de blessure.
- Planification automatique complète d'une préparation.
- Analyse vidéo de la foulée.
- Application mobile native.
- Connexion directe à Garmin.
- Import direct de fichiers FIT.
- Cartographie ou partage social.
