# Détail, streams et segmentation

Le détail vérifie d'abord que l'identifiant est une course connue dans
`synced_activities`. Il utilise ensuite `activity_details_cache` avec une
fraîcheur de 24 heures. Les détails et intervalles sont validés et normalisés
avant écriture ; une ancienne valeur valide peut servir de repli avec le statut
`stale` si Intervals.icu est momentanément indisponible.

Les endpoints externes utilisés sont `/activity/{id}`,
`/activity/{id}/intervals` et, uniquement à l'ouverture de l'onglet Courbes,
`/activity/{id}/streams`. Les streams ne sont jamais persistés bruts.

Les séries internes autorisées sont le temps, distance, vitesse, fréquence
cardiaque, cadence, altitude et puissance. Le champ `latlng` observé chez
Intervals.icu est ignoré, comme toute latitude, longitude, polyline, route ou
trace GPS. Les longueurs incohérentes sont signalées dans `qualityWarnings`.

La segmentation est descriptive et déterministe : `lap` conserve les laps,
`thirds` divise chaque lap en trois, et `adaptive` applique les seuils de
distance prévus avec un maximum de huit segments. Aucun segment ne dure moins
de 90 secondes lorsque la durée est connue. Sans lap, l'activité devient un lap
synthétique. Aucune fatigue, dégradation, technique ou recommandation n'est
déduite.