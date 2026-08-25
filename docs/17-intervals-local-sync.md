# Synchronisation locale Intervals.icu

## Flux

```text
Intervals.icu -> POST /api/sync/activities -> synced_activities -> GET /api/activities
```

Intervals.icu reste la source de vérité. SQLite est un cache local de travail.
La synchronisation est déclenchée manuellement par l'utilisateur ; il n'y a pas
de cron, webhook ou synchronisation automatique à l'ouverture.

## Période

La période par défaut est de 12 semaines glissantes. Le corps JSON facultatif
accepte `weeks`, un entier compris entre 1 et 52. Les dates calculées côté serveur
sont envoyées à Intervals.icu comme `oldest=YYYY-MM-DD` et `newest=YYYY-MM-DD`.
Les bornes sont inclusives pour la lecture du cache et suivent le comportement
de l'endpoint Intervals.icu observé pendant l'intégration.

## Activités retenues

L'endpoint réel a renvoyé les types `Run`, `Swim` et `WeightTraining`. Seul `Run`
est accepté après normalisation. Les types inconnus, absents ou ambigus sont
ignorés ; les objets qui ne respectent pas le contrat minimal sont comptés comme
invalides. Le nom de l'activité ne sert jamais à deviner le sport.

Le mapping utilise uniquement les champs observés : identifiant, date de début,
fuseau, nom, distance en mètres, durées en secondes, vitesse en m/s, fréquence
cardiaque en bpm, cadence en pas/minute, puissance `icu_average_watts`, dénivelé,
charge `icu_training_load` et date `icu_sync_date`. Aucun payload brut n'est
persisté.

## Idempotence

Les activités sont upsertées par `intervals_activity_id`. Le premier passage
compte une création ; un passage identique compte `unchanged` et ne duplique pas
la ligne ; une modification des champs mappés compte une mise à jour. `created_at`
est conservé et `synced_at` est rafraîchi à chaque synchronisation réussie.
Les activités locales ne sont jamais supprimées automatiquement.

## Sécurité et limites

Les appels Intervals.icu restent côté serveur et les secrets ne sont jamais
retournés au navigateur ou écrits dans les logs. Les erreurs globales sont
retournées avec un `requestId`; une réponse 429 conserve aussi `Retry-After` sans
relance agressive.

Cette étape ne persiste ni détail, ni stream brut, ni GPS, et n'intègre ni
calendrier, ni graphique, ni Gemini. `manual_sessions` reste une source séparée,
exclue de cette synchronisation et de la liste locale des courses.