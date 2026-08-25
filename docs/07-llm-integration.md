
# Intégration LLM

## Rôle de Gemini

Gemini explique les résultats calculés.
Gemini ne calcule aucune métrique et ne reçoit pas de streams bruts.

## Entrée autorisée

- statistiques d'activité agrégées ;
- métriques d'intervalles ;
- constats déterministes ;
- comparaison historique agrégée ;
- contexte utilisateur ;
- données de qualité ;
- instruction de ton et de limites.

## Entrée interdite

- coordonnées GPS ;
- traces GPS ;
- fichiers FIT ;
- clés API ;
- données personnelles inutiles ;
- notes libres non filtrées si elles contiennent des données sensibles.

## Format de sortie obligatoire

La sortie est du JSON validé par Zod.

Champs :
- summary
- observed_facts
- historical_comparison
- hypotheses
- limitations
- questions_to_consider
- next_steps
- safety_note

## Règles éditoriales

- Distinguer fait et hypothèse.
- Citer les métriques à l'origine d'une conclusion.
- Ne pas inventer de donnée.
- Ne pas diagnostiquer une pathologie, blessure ou surentraînement.
- Utiliser un langage prudent.
- Présenter les actions comme des pistes à examiner.
