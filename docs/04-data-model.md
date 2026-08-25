
# Modèle de données local

Le modèle local est défini dans `src/lib/db/schema.ts`. Les activités synchronisées
et les séances manuelles sont volontairement stockées dans deux tables distinctes :
`synced_activities` et `manual_sessions`. Elles ne doivent pas être réunies dans
une table polymorphe.

Les timestamps techniques sont des chaînes ISO 8601 UTC. La date métier d'une
séance manuelle est une chaîne locale stricte `YYYY-MM-DD`, sans conversion de
fuseau.

Les payloads JSON persistés sont validés avec les contrats Zod internes avant
écriture et après lecture. Aucun GPS brut n'est stocké.

## Tables MVP

### activity_cache

Cache minimal des métadonnées nécessaires à l'interface.

- id
- intervals_activity_id
- start_date
- sport
- name
- distance_m
- moving_time_s
- elevation_gain_m
- avg_hr
- avg_cadence
- updated_at

### activity_context

Informations ajoutées manuellement.

- id
- intervals_activity_id
- session_goal
- perceived_exertion
- unusual_fatigue
- pain_flag
- note
- created_at
- updated_at

### analyses

Résultats d'une analyse.

- id
- intervals_activity_id
- deterministic_metrics_json
- historical_comparison_json
- llm_response_json
- llm_model
- prompt_version
- created_at

### action_items

Actions ou hypothèses retenues.

- id
- analysis_id
- category
- content
- status
- created_at
- completed_at


### goals
- id
- title
- type
- status
- start_date
- target_date
- target_value
- target_unit
- target_direction
- description
- success_criteria_json
- created_at
- updated_at



### conversation_threads
- id
- title
- created_at
- updated_at

### conversation_messages
- id
- thread_id
- role
- content
- evidence_json
- model
- prompt_version
- created_at


## Règles

- Les identifiants Intervals.icu sont stockés comme références externes.
- Les streams complets ne sont pas persistés en V0.
- Les coordonnées GPS ne sont pas stockées localement en V0.
- Les champs JSON doivent être validés côté application.
