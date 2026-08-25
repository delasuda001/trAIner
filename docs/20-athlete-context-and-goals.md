# Mon contexte et mes objectifs

La page `/context` permet de déclarer explicitement un cadre sportif local :
profil, repères de performance, priorités, semaine type, bloc actuel et
préférences de lecture.

## Contexte versionné

Le contexte est stocké dans `athlete_context_versions` sous la forme d'un JSON
V1 validé par Zod. Chaque enregistrement crée une nouvelle version. L'ancienne
version `active` est archivée et la nouvelle est activée dans une transaction.
Une version active est retournée par `GET /api/context`; aucun contexte n'est
déduit automatiquement des activités.

La semaine type est déclarative : elle ne crée pas d'événement calendrier et ne
modifie aucune séance manuelle. Le texte source et le contexte ne doivent pas
contenir de données médicales, secrets, identifiants API ou données Garmin brutes.

## Objectifs

Les objectifs structurés sont stockés dans `goals`. Les objectifs secondaires
peuvent être actifs simultanément. Lorsqu'un nouvel objectif devient `primary`
et `active`, l'ancien est rétrogradé en `secondary` et `paused` dans la même
transaction. Une ligne archivée n'est jamais supprimée physiquement.

## Limites

Cette étape n'ajoute ni recommandation, ni suggestion, ni analyse, ni détection,
ni chat, ni appel Gemini/LLM. Les séances de `manual_sessions` ne sont jamais
injectées automatiquement dans les objectifs ou le contexte.