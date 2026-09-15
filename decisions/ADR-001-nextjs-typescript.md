# ADR-001 : Next.js (App Router) et TypeScript strict

> Contenu reconstitué a posteriori le 2026-09-09 : le fichier était vide depuis
> l'origine. La décision elle-même n'est pas inventée — elle est en vigueur et
> visible dans `AGENTS.md`, `package.json` et l'arborescence `src/app/` ; seule
> la rédaction du raisonnement est reconstituée.

## Contexte

Run Insights est une application web personnelle qui doit servir une interface
de lecture d'activités et exposer des routes serveur pour parler à Intervals.icu
et à Gemini sans jamais exposer de secret au navigateur (cf. ADR-002, ADR-004).
Il faut un socle unique frontend + backend léger, typé de bout en bout, avec un
écosystème de test et de lint mûr.

## Décision

Utiliser **Next.js avec l'App Router** comme framework unique (pages, Route
Handlers serveur, `"use client"` ciblé) et **TypeScript en mode strict** sur
tout le code. Règles associées : pas de `any`, types explicites, logique de
calcul isolée dans `src/lib` et jamais dans les composants React. Tailwind CSS
et shadcn/ui pour l'UI, ESLint (`eslint-config-next`) et Vitest pour la qualité.

## Conséquences

- Les appels aux services externes vivent dans des Route Handlers serveur ; les
  secrets restent côté serveur.
- Le typage strict est un invariant de revue : toute donnée externe est validée
  par Zod avant d'entrer dans le domaine typé.
- Le rendu et la logique métier sont séparés, ce qui garde `src/lib` testable
  sans DOM.
- Une montée de version majeure de Next.js peut imposer des adaptations (voir le
  bloc de règles Next.js régénéré dans `AGENTS.md`).

## Alternatives écartées

- **SPA (Vite/React) + API séparée** : deux déploiements et deux configs de
  typage pour un usage mono-utilisateur, sans bénéfice.
- **Framework fullstack non-React** : écart avec l'écosystème shadcn/ui et
  Recharts retenus pour l'UI.
- **TypeScript non strict / JavaScript** : incompatible avec l'exigence de
  fiabilité des calculs et des contrats de données.
