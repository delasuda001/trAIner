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

## Profil de performance (calculé, lecture seule)

Sous le contexte déclaré, la page affiche un **profil de performance calculé**,
clairement distinct des champs saisis à la main. Il est produit à la demande
par `GET /api/performance-profile` et agrège : l'allure seuil estimée et sa
confiance, les meilleurs efforts par durée (+ FC moyenne + date de l'activité
source), la tendance de volume de course sur 12 semaines et les points clés
des débriefs récents.

Le bloc « Allure seuil estimée » affiche une **note de péremption** dès qu'un
des efforts retenus a plus de 8 semaines, indépendamment du niveau de
confiance (même logique et même message que le débrief, cf. `docs/22`).

La liste « Meilleurs efforts » marque chaque effort **utilisé** ou **écarté**
(avec le motif : filtre d'intensité FC ou de plausibilité de dégradation),
cohérent avec `rejectedPoints` produit par le moteur de seuil. Les points clés
ne comptent qu'**une analyse par activité** (la plus récente, lecture bornée à
20 lignes) : une analyse régénérée ne crée pas de doublon.

Le bouton **« Recalculer mon profil »** déclenche
`POST /api/performance-profile/recalculate` : calcul des résumés de streams
manquants sur une fenêtre bornée (`weeks`, 1–52, défaut 12), séquentiel,
plafonné, respectant `Retry-After` sur une réponse 429 d'Intervals.icu.
Aucun déclenchement automatique. Ce profil ne contient aucun score de
charge/fatigue et n'est jamais persisté ni transformé en contexte déclaré ;
il alimente en revanche le débrief et la conversation en complément du
contexte saisi.

## Objectifs

Les objectifs structurés sont stockés dans `goals`. Les objectifs secondaires
peuvent être actifs simultanément. Lorsqu'un nouvel objectif devient `primary`
et `active`, l'ancien est rétrogradé en `secondary` et `paused` dans la même
transaction. Une ligne archivée n'est jamais supprimée physiquement.

## Limites

Le contexte déclaré et les objectifs n'ajoutent ni recommandation, ni
suggestion, ni détection, ni chat, ni appel Gemini/LLM. Le profil de
performance calculé reste descriptif (agrégats déterministes, aucun appel
LLM) et n'est produit que sur action explicite. Les séances de
`manual_sessions` ne sont jamais injectées dans les objectifs, le contexte
ou le profil.