
# Périmètre MVP

## Fonctionnalités incluses

1. Liste des activités récentes depuis Intervals.icu.
2. Filtre sur les activités de course à pied.
3. Page de détail d'une activité.
4. Affichage de statistiques principales.
5. Affichage des laps et intervalles.
6. Graphiques d'allure, fréquence cardiaque, cadence et altitude.
7. Calcul de métriques déterministes.
8. Saisie du ressenti et de notes personnelles.
9. Génération manuelle d'un débrief Gemini.
10. Sauvegarde locale des analyses et actions à suivre.
11. Comparaison avec un premier ensemble de séances similaires.
12. Création, modification et archivage d'objectifs personnels.
13. Vue de suivi d'un objectif.
14. Conversation guidée par les données.
15. Réponses avec activités et métriques sources visibles.
16. Évaluation prudente de la cohérence entre une séance et un objectif.
17. Estimation dynamique de l'allure et de la FC de seuil à partir des
    streams personnels (sans configuration externe, sans table statique).
18. Classification de chaque séance/segment dans une zone d'entraînement
    (récupération, base, tempo, seuil, VO2max, anaérobie).
19. Recommandations techniques post-activité (exercices, allure cible
    ajustée pour la prochaine séance de même type), présentées comme des
    pistes argumentées et non comme des prescriptions certaines.
20. Indicateur de confiance et de complétude de l'estimation de seuil, avec
    suggestion explicite de séance à réaliser pour combler les données
    manquantes.


## Critères de succès

Le MVP est utile si l'utilisateur peut :
- sélectionner une séance ;
- comprendre sa régularité et son évolution intra-séance ;
- comparer cette séance à plusieurs séances antérieures ;
- lire un débrief qui cite les faits et les limites ;
- conserver une action ou une hypothèse à vérifier.

## Non-objectifs (révisés)

- Diagnostic médical, détection de blessure, évaluation de douleur.
- Score de charge, de fatigue globale ou de "readiness" (donnée non fiable
  disponible dans les sources actuelles).
- Planification automatique complète d'une préparation.
- Modification automatique et silencieuse d'un plan ou d'une séance future :
  toute proposition d'ajustement reste une suggestion soumise à validation
  explicite de l'utilisateur.
- Dépendance à des zones ou seuils configurés côté Intervals.icu/Garmin :
  le calcul reste local et portable vers toute source de streams bruts.
