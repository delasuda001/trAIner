
# Workflows utilisateur

## Workflow principal : analyser une activité

1. L'utilisateur ouvre le tableau de bord.
2. L'application récupère les activités récentes depuis Intervals.icu.
3. L'utilisateur sélectionne une activité de course.
4. L'application charge le détail, les intervalles et les streams nécessaires.
5. L'utilisateur consulte les statistiques et graphiques.
6. L'utilisateur renseigne le contexte et le ressenti.
7. L'utilisateur lance l'analyse.
8. Le moteur calcule des métriques déterministes.
9. L'application récupère des références historiques comparables.
10. Gemini produit un débrief JSON validé.
11. L'utilisateur lit le débrief et conserve des actions à suivre.

## Workflow secondaire : revoir une analyse

1. L'utilisateur ouvre une activité déjà analysée.
2. L'application charge le résultat stocké localement.
3. L'utilisateur peut modifier son contexte ou régénérer l'analyse.
4. Chaque analyse conserve une date, une version et un modèle utilisé.
