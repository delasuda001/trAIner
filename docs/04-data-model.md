
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

## Tables

Inventaire aligné sur `src/lib/db/schema.ts` (source de vérité). Sauf mention
contraire, chaque table porte `created_at` et `updated_at` (chaînes ISO 8601
UTC). Voir aussi `docs/15-local-data-model.md`.

### synced_activities

Activités de course importées d'Intervals.icu (`intervals_activity_id` unique).
Jamais alimentée par les séances manuelles.

- id
- intervals_activity_id
- start_date
- timezone
- name
- sport_type
- distance_m
- moving_time_s
- elapsed_time_s
- elevation_gain_m
- average_speed_mps
- average_heart_rate_bpm
- max_heart_rate_bpm
- average_cadence_spm
- average_power_w
- training_load
- source_updated_at
- synced_at
- created_at
- updated_at

### activity_details_cache

Cache 24 h du détail et des intervalles validés. Jamais de streams bruts ni
de GPS.

- id
- intervals_activity_id (unique)
- detail_json
- intervals_json
- source_updated_at
- fetched_at
- created_at
- updated_at

### activity_stream_summaries

Résumé dérivé des streams d'une activité : meilleurs efforts par durée de
référence (allure + FC moyenne) + compteur d'échantillons. Upsert par
`(intervals_activity_id, stream_version)`. Jamais de série brute ni de
donnée de localisation.

- id
- intervals_activity_id
- stream_version
- summary_json
- created_at
- updated_at

### manual_sessions

Séances non-course saisies à la main (calendrier uniquement). Exclues de
toute analyse de course. `session_date` est une date locale stricte
`YYYY-MM-DD`.

- id
- session_date
- discipline
- duration_minutes
- label
- note
- created_at
- updated_at

### user_confirmations

Candidats de détection et leur résolution explicite.

- id
- confirmation_type
- status
- source_activity_id
- source_segment_id
- detection_confidence
- proposed_payload_json
- resolved_payload_json
- created_at
- resolved_at
- updated_at

### athlete_context_versions

Contexte athlète versionné (JSON V1 validé par Zod). Une seule version
`active`.

- id
- status
- context_json
- source_text
- created_at
- activated_at
- archived_at
- updated_at

### goals

Objectifs structurés. Un seul objectif `primary` peut être `active`.

- id
- title
- type
- priority
- status
- start_date
- target_date
- target_value
- target_unit
- description
- definition_json
- created_at
- updated_at

### activity_contexts

Informations ajoutées manuellement pour une activité (ressenti, note).

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

Résultats d'une analyse. `prompt_version` identifie le format de réponse LLM
persisté (voir `docs/07-llm-integration.md`).

- id
- intervals_activity_id
- deterministic_metrics_json
- historical_comparison_json
- llm_response_json
- llm_model
- prompt_version
- created_at
- updated_at

### action_items

Actions ou hypothèses retenues, rattachées à une analyse.

- id
- analysis_id
- category
- content
- status
- created_at
- updated_at
- completed_at

### conversation_threads

- id
- title
- goal_id
- created_at
- updated_at

### conversation_messages

`content_json` porte le message (texte utilisateur ou réponse structurée).
`model` et `prompt_version` (tous deux nullable) ne sont renseignés que sur
les messages `assistant` : `model` reçoit `generated.model`, `prompt_version`
reçoit `CONVERSATION_PROMPT_VERSION` (voir `docs/07-llm-integration.md`),
distinct de `analyses.prompt_version`. Pas de colonne `updated_at`.

- id
- thread_id
- role
- content_json
- model
- prompt_version
- created_at


## Règles

- Les identifiants Intervals.icu sont stockés comme références externes.
- Les streams complets ne sont pas persistés en V0.
- Les coordonnées GPS ne sont pas stockées localement en V0.
- Les champs JSON doivent être validés côté application.
