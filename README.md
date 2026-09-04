# Run Insights

Application web personnelle d'analyse d'activités de course à pied.


Elle utilise Intervals.icu comme source de données sportives. Ce premier vertical
slice affiche les activités récentes et le détail de leurs laps.

## Objectif

Consulter une séance de course et ses données brutes avant les futures fonctions
d'analyse.

## Principes

- Les calculs sont déterministes et testables.
- Les données GPS précises ne sont jamais envoyées au LLM.
- L'application ne produit aucun diagnostic médical.
- Les clés API restent uniquement dans .env.local.

## Démarrage local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Ouvrir ensuite http://localhost:3000. Les variables attendues dans `.env.local`
sont `INTERVALS_API_KEY` et `INTERVALS_ATHLETE_ID`. Les contrôles disponibles sont
`npm run lint`, `npm run typecheck`, `npm run test` et `npm run build`.

## Base locale

La base SQLite est configurée par `DATABASE_URL=file:./data/run-insights.db`.
Les commandes Drizzle sont `npm run db:generate`, `npm run db:migrate` et
`npm run db:studio`. La base n'est jamais supprimée automatiquement.

La liste principale lit le cache local. Utilisez le bouton « Synchroniser » pour
importer manuellement les courses des 12 dernières semaines. `POST
/api/sync/activities` accepte éventuellement `{ "weeks": 1 }` à `{ "weeks": 52 }`.
Une seconde synchronisation ne crée pas de doublon. Les séances manuelles restent
dans `manual_sessions` et ne sont pas incluses dans les activités analysables.

L'accueil permet aussi d'ajouter des séances manuelles pour un futur calendrier.
Les types autorisés sont musculation, natation, mobilité et autre ; la durée est
limitée à 720 minutes. Ces séances ne participent à aucune analyse de course.

Le dashboard affiche le calendrier semaine/mois et le volume de course des
12 dernières semaines. Le volume et la synthèse sont explicitement « Course
uniquement » ; les séances manuelles n'apparaissent que dans le calendrier.

La page détail charge les streams uniquement dans l'onglet « Courbes ». Aucun
stream brut ni donnée GPS n'est stocké ou retourné.

La page [Mon contexte](/context) permet de déclarer un contexte sportif
versionné, une semaine type et des objectifs. Cette étape ne produit aucune
recommandation et n'intègre pas Gemini ou un autre LLM.

## Documentation

Voir le dossier docs, notamment docs/00-product-context.md (positionnement révisé)
et docs/22-dynamic-thresholds-and-zones.md (estimation dynamique des seuils).
