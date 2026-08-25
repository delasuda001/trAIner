# trAIner

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
`npm run lint`, `npm run typecheck` et `npm run build`.

## Documentation

Voir le dossier docs.
