# Dashboard calendrier et volume de course

Le dashboard lit séparément `synced_activities` et `manual_sessions`. La seule
fusion est réalisée par `buildCalendarDisplayItems`, qui produit des éléments
de présentation typés avec `source: "running_sync" | "manual"`.

Les activités manuelles apparaissent donc dans le calendrier, mais jamais dans
le volume, la synthèse ou les futures analyses de course.

## Volume et synthèse

Le volume couvre toujours les 12 semaines glissantes incluant la semaine en
cours. Chaque semaine commence le lundi et finit le dimanche ; les semaines
sans course sont conservées avec `0 km`. La synthèse affiche explicitement
« Course uniquement » et ne calcule aucune charge ou moyenne multi-sport.

## Calendrier

La vue semaine est affichée par défaut et propose sept colonnes lundi-dimanche.
La vue mois utilise une grille lundi-dimanche et atténue les jours hors mois.
Les tailles des éléments dépendent uniquement de la distance pour une course et
de la durée pour une séance manuelle. Ni fréquence cardiaque, ni charge, ni
intensité ne sont utilisées.

Les courses ouvrent leur activité Intervals.icu. Les séances manuelles restent
des éléments de calendrier sans lien vers une activité de course.

Cette étape n'ajoute ni interprétation, ni analyse, ni recommandation, ni GPS,
ni streams bruts, ni Gemini ou LLM.