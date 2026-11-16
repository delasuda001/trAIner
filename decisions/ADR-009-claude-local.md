# ADR-009 : Claude via l'abonnement local comme coach

Statut : accepté (novembre 2026). Remplace l'usage de Gemini.

## Décision
- Client unique `LlmClient` (`src/lib/coach/llm.ts`) ; backend actuel : SDK Agent Claude qui
  réutilise la connexion claude.ai du CLI `claude` (pas de clé API). Aucun outil, aucun réglage
  de projet chargé, aucune session persistée.
- Le moteur déterministe calcule tout ; Claude ne fait qu'interpréter une charge utile compacte
  et formatée (~1 300 tokens par séance), en JSON structuré validé par Zod.
- Garde-fou : tout chiffre de la réponse doit figurer dans la charge utile, sinon un réessai,
  puis repli sur le verdict déterministe.
- Quota Pro partagé : cache par sujet et empreinte des entrées ; génération seulement après une
  synchro qui ramène une nouvelle course, ou sur demande. Modèle par défaut : Sonnet.

## Conséquences
- Pour un usage multi-utilisateur, ajouter un backend « clé API » dans `src/lib/coach/index.ts`.
