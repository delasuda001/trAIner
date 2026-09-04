
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


## Format de sortie v2

Champs (remplace la version précédente) :
- summary
- observed_facts
- historical_comparison (avec deltas chiffrés)
- zone_classification_summary
- technical_recommendations   (nouveau — exercices concrets, sourcés)
- next_session_pace_guidance  (nouveau — allure cible ajustée, chiffrée,
  avec justification factuelle)
- hypotheses
- limitations
- questions_to_consider
- next_steps
- safety_note (nouveau : conditionnel, affiché uniquement si le contexte
  utilisateur signale douleur/fatigue inhabituelle ; absent sinon)

## Règles éditoriales (révisées)

- Ton argumenté et technique, adapté à un utilisateur expérimenté qui a
  explicitement demandé des retours moins prudents que la version initiale.
- Toute recommandation d'allure ou d'exercice doit citer la métrique ou la
  comparaison qui la fonde.
- Aucune invention de métrique absente des données fournies.
- Frontière stricte et non négociable : aucune interprétation médicale,
  aucune évaluation de douleur/blessure, aucun score de charge ou de
  fatigue globale, même sur demande implicite de l'utilisateur.

