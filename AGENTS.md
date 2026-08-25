
# Instructions pour les assistants de développement

## Contexte

Run Insights est une application web personnelle d'analyse de course à pied.
Les activités proviennent de l'API Intervals.icu, elle-même connectée à Garmin.

L'application sert à :
- consulter une activité ;
- analyser les laps et les intervalles ;
- calculer des métriques de régularité et de dégradation ;
- comparer une séance à l'historique personnel ;
- générer un débrief IA fondé sur des résultats structurés ;
- enregistrer des notes, analyses et actions à suivre.

## Stack obligatoire

- Next.js avec App Router
- TypeScript strict
- Tailwind CSS
- shadcn/ui
- Drizzle ORM
- SQLite en développement local
- Zod pour toute validation externe
- Vitest pour les tests unitaires
- Google GenAI SDK pour Gemini
- Recharts pour les graphiques

## Règles de code

- Ne jamais utiliser `any`.
- Préférer des types explicites et des fonctions pures.
- Ne pas mélanger logique métier et composants React.
- Toute logique de calcul doit être dans src/lib.
- Toute donnée venant d'une API externe doit être validée avec Zod.
- Toute réponse LLM doit être validée avec Zod.
- Écrire ou mettre à jour les tests lors de toute modification d'un calcul.
- Ne jamais exposer une clé API dans le frontend.
- Ne jamais stocker de secret dans Git.
- Ne jamais appeler Intervals.icu directement depuis le navigateur.
- Ne jamais envoyer la trace GPS complète ou des coordonnées GPS au LLM.
- Ne jamais produire de diagnostic médical, de détection de blessure ou de conseil médical.

## Principes d'analyse

- Distinguer systématiquement :
  1. les faits observés ;
  2. les comparaisons historiques ;
  3. les hypothèses ;
  4. les limites ;
  5. les pistes à examiner.
- Une interprétation doit citer les métriques qui la soutiennent.
- Une action proposée n'est jamais présentée comme une prescription certaine.
- Le LLM ne doit pas inventer de métrique absente des données fournies.


## Conversation et objectifs

L'application propose deux usages LLM :
- un débrief post-activité structuré ;
- une conversation guidée par les données sur les activités et objectifs.

Le LLM ne reçoit jamais l'historique brut complet.
Avant tout appel LLM, l'application doit :
1. identifier le type de question ;
2. sélectionner la période pertinente ;
3. récupérer uniquement les activités nécessaires ;
4. calculer les métriques et comparaisons ;
5. produire un contexte JSON structuré ;
6. valider la réponse LLM avec Zod.

Chaque réponse conversationnelle doit :
- distinguer les faits, comparaisons, hypothèses et limites ;
- inclure une liste de preuves exploitables par l'interface ;
- citer les identifiants des activités ou agrégats utilisés ;
- signaler les données manquantes ;
- ne pas présenter une conclusion d'entraînement comme certaine ;
- ne jamais diagnostiquer une blessure, une maladie ou un état de surentraînement.

## Objectifs

Les objectifs sont des entités structurées persistées en base.
Ils ne doivent pas être stockés uniquement sous forme de texte dans les prompts.

Pour toute analyse relative à un objectif :
- comparer des activités réellement comparables ;
- contrôler les facteurs visibles comme l'allure, le dénivelé, la durée et la fréquence cardiaque ;
- expliciter les limites de comparabilité ;
- ne pas imposer de norme universelle de cadence ou de technique.


## Sécurité

- Les secrets sont lus uniquement depuis les variables d'environnement serveur.
- Les logs ne doivent pas contenir de clés API, de données GPS précises ou de notes personnelles complètes.
- Prévoir une abstraction de stockage afin de faciliter une migration future vers PostgreSQL et Supabase.

## Méthode de travail attendue

Pour chaque tâche :
1. Lire les documents pertinents dans docs.
2. Proposer un plan concis.
3. Modifier uniquement les fichiers nécessaires.
4. Ajouter ou adapter les tests.
5. Exécuter lint, vérification TypeScript et tests.
6. Résumer les changements et les points restant à valider.

Ne pas implémenter de fonctionnalité hors du périmètre MVP sans demande explicite.


