
# Intégration LLM

## Rôle de Gemini

Gemini explique les résultats calculés.
Gemini ne calcule aucune métrique et ne reçoit pas de streams bruts.

## Entrée autorisée

- statistiques d'activité agrégées ;
- métriques d'intervalles ;
- constats déterministes ;
- comparaison historique agrégée ;
- estimation de seuil et classification en zones (résultat, jamais l'algorithme ;
  le seuil de ce débrief provient des résumés de streams en cache, dans la
  fenêtre de 20 semaines — cf. `docs/22` — sans fetch de streams déclenché) ;
- profil de performance calculé (`performanceProfile`) : allure seuil estimée et
  sa confiance, meilleurs efforts agrégés par durée + FC moyenne, tendance de
  volume de course sur 12 semaines, `key_takeaways` des débriefs récents. Agrégats
  uniquement, aucune série brute, jamais un score de charge/fatigue. Fourni en
  complément du contexte déclaré, jamais en remplacement (débrief ET conversation) ;
- contexte utilisateur (déclaré) ;
- données de qualité ;
- instruction de ton et de limites.

## Entrée interdite

- coordonnées GPS ;
- traces GPS ;
- fichiers FIT ;
- clés API ;
- données personnelles inutiles ;
- notes libres non filtrées si elles contiennent des données sensibles.


## Format de sortie

Le contrat de réponse fait autorité dans `src/lib/llm/schemas.ts`
(`activityAnalysisResponseSchema`). Ce document en est le miroir lisible ;
en cas de divergence, le schéma Zod prime.

Champs (tous obligatoires sauf mention contraire) :

- `key_takeaways` — tableau de 1 à 3 chaînes ; synthèse en langage simple,
  sans jargon, affichée en tête du débrief.
- `summary` — chaîne.
- `observed_facts` — tableau de chaînes (constats déterministes).
- `historical_comparison` — chaîne ou `null` ; formulée avec les deltas
  chiffrés (écart d'allure en %, de FC en bpm, de cadence en pas/min).
- `zone_classification_summary` — chaîne ; DOIT indiquer quelle valeur d'allure
  seuil a servi à classer les zones ET sa source. Si la confiance de
  l'estimation dynamique est `insufficient` ou `low` et qu'une référence de
  performance déclarée par l'utilisateur (contexte athlète) sert de repli, le
  texte DOIT dire explicitement que les zones reposent sur cette référence
  déclarée, pas sur un seuil calculé.
- `technical_recommendations` — tableau de chaînes ; exercices concrets et
  sourcés (durée, répétitions, zone d'intensité).
- `next_session_pace_guidance` — objet ou `null` :
  - `recommendedPaceMps` — nombre ou `null` (valeur numérique interne).
  - `recommendedPaceDisplay` — chaîne ; allure cible au format `m:ss/km`.
  - `rationale` — chaîne ; justification factuelle et sourcée.
  - `adjustments` — tableau de chaînes.
- `hypotheses` — tableau de chaînes.
- `limitations` — tableau de chaînes ; reçoit aussi toute clarification qui
  affecte la fiabilité d'une conclusion (il n'y a plus de section « questions »).
- `next_steps` — tableau de chaînes.
- `safety_note` — chaîne ou `null` ; renseignée uniquement si le contexte
  utilisateur signale une douleur ou une fatigue inhabituelle, `null` sinon.

## Format de sortie de la conversation guidée

`analyzeConversation` produit un objet distinct
(`conversationResponseSchema` dans `src/lib/llm/schemas.ts`) : `summary`,
`observedFacts`, `comparisons`, `hypotheses`, `limitations`, `missingData`,
`evidence` (liste d'`{ activityId, label, value }`). Ce contrat évolue
indépendamment de celui du débrief.

## Versionnement des prompts

### Deux `prompt_version` indépendantes

Le débrief d'activité et la conversation guidée ont des prompts **et** des
schémas de réponse qui évoluent séparément. `src/lib/llm/gemini-client.ts`
expose donc **deux constantes distinctes**, chacune persistée dans la colonne
`prompt_version` de sa propre table :

| Usage | Schéma de réponse | Constante | Valeur | Colonne persistée |
| --- | --- | --- | --- | --- |
| Débrief d'activité (`analyze`) | `activityAnalysisResponseSchema` | `DEBRIEF_PROMPT_VERSION` | `"1.3"` | `analyses.prompt_version` |
| Conversation guidée (`analyzeConversation`) | `conversationResponseSchema` | `CONVERSATION_PROMPT_VERSION` | `"1.0"` | `conversation_messages.prompt_version` (message `assistant`) |

Historique `DEBRIEF_PROMPT_VERSION` :

- `1.0` — format initial.
- `1.1` — ajout de `key_takeaways` (obligatoire, min. 1).
- `1.2` — retrait de `questions_to_consider` (les clarifications de fiabilité
  rejoignent `limitations`) ; transparence imposée sur la source de la valeur
  de seuil dans `zone_classification_summary`. Retirer un champ n'invalide pas
  les payloads antérieurs (Zod non-strict les strippe) : les analyses `1.1`
  restent lisibles, seules les `1.0` (sans `key_takeaways`) restent
  « à régénérer ».
- `1.3` — **changements de logique de contenu, schéma inchangé** : comparaison
  historique normalisée par `% de l'allure seuil` (jamais versionnée
  jusqu'ici), provenance multi-séances du seuil, correction du filtre de
  plausibilité (efforts longs non maximaux désormais écartés). Les payloads
  antérieurs restent **valides et affichables** ; ils sont seulement signalés
  « logique obsolète » (voir ci-dessous).

`CONVERSATION_PROMPT_VERSION` démarre à `1.0` : premier format explicitement
versionné de `conversationResponseSchema`.

Aucun code ne suppose que les deux valeurs sont égales : elles ne sont jamais
comparées entre elles ni entre tables. Une hausse de l'une n'entraîne pas
l'autre.

Il existe par ailleurs une **version narrative** (« v1 » prudente initiale,
puis l'itération qui a ajouté `technical_recommendations`,
`next_session_pace_guidance`, `safety_note` conditionnel, puis
`key_takeaways`) : elle sert uniquement au récit produit dans la
documentation et les ADR, elle n'est pas stockée.

### Compatibilité ascendante à la lecture : forme vs logique

Deux vérifications **distinctes**, aux effets différents :

1. **Validation de forme** (bloquante). `parseStoredAnalysis`
   (`analysis-repository.ts`) revalide le `llm_response_json` persisté avec le
   schéma Zod courant. Si un **champ requis manque** (typiquement une analyse
   `1.0` sans `key_takeaways`), la lecture renvoie `formatOutdated: true`,
   `analysis: null` et l'interface affiche un état « à régénérer » plein —
   aucun rendu partiel, aucune valeur par défaut fabriquée. Un champ retiré du
   schéma est simplement strippé (non bloquant).

2. **Fraîcheur de logique** (non bloquante). La route compare **strictement**
   `analyses.prompt_version` stocké à `DEBRIEF_PROMPT_VERSION` courant et
   renvoie `logicStale: (stocké !== courant)` + `currentPromptVersion`. Quand
   `logicStale` est vrai mais `formatOutdated` faux, le contenu **reste
   affiché** ; un bandeau discret invite à régénérer « pour bénéficier des
   dernières améliorations » (nouvelle logique de comparaison historique,
   d'estimation de seuil…). C'est ce qui couvre les changements de *logique de
   contenu* sans changement de schéma — auparavant invisibles.

La conversation guidée n'a pas encore d'équivalent :
`conversation_messages.prompt_version` et `conversation_messages.model` sont
nullable (messages `user`, et messages `assistant` d'avant l'ajout des
colonnes, portent `NULL`) et servent pour l'instant de trace, pas de filtre
de rendu.

## Règles éditoriales (révisées)

- Ton argumenté et technique, adapté à un utilisateur expérimenté qui a
  explicitement demandé des retours moins prudents que la version initiale.
- Toute recommandation d'allure ou d'exercice doit citer la métrique ou la
  comparaison qui la fonde.
- Aucune invention de métrique absente des données fournies.
- Frontière stricte et non négociable : aucune interprétation médicale,
  aucune évaluation de douleur/blessure, aucun score de charge ou de
  fatigue globale, même sur demande implicite de l'utilisateur.

## Limites connues à surveiller

- **Rétroaction `recentKeyTakeaways`** : le `performanceProfile` envoyé au
  débrief contient les `key_takeaways` des 3–5 débriefs les plus récents. Le
  modèle peut être tenté de recopier ses propres formulations d'une séance à
  l'autre plutôt que d'analyser la séance courante. Non bloquant (le contexte
  déterministe de la séance reste prioritaire), mais à surveiller : si les
  débriefs deviennent répétitifs, réduire ou retirer ce champ du contexte de
  débrief (le garder pour la seule page profil).
- Le débrief reçoit désormais le profil complet à chaque génération, ce qui
  augmente la taille du prompt.

