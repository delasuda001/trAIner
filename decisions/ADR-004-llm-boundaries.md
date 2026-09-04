
# ADR-004 : Frontières du LLM (révisé)

## Contexte
Le positionnement initial imposait une prudence maximale sur l'ensemble des
sujets (technique, allure, comparaison, santé). Un usage mono-utilisateur
expérimenté a motivé une révision : la prudence généralisée réduisait la
valeur du produit sans bénéfice réel pour ce profil d'utilisateur.

## Décision
Distinguer deux catégories strictement différentes :
1. Domaine technique/entraînement (allure, VMA, zones, exercices, structure
   de séance) : traitement argumenté, chiffré, actionnable.
2. Domaine médical/physiologique non mesurable (douleur, blessure, charge,
   fatigue globale, readiness) : exclusion stricte, non négociable, quel
   que soit le niveau de l'utilisateur — limite de compétence réelle du
   modèle, pas seulement une prudence éditoriale.

## Conséquences
- Le contrat de sortie LLM v2 autorise des recommandations techniques
  concrètes et chiffrées.
- `safety_note` devient conditionnel plutôt que systématique.
- Aucune fonctionnalité de score de charge/fatigue n'est développée, même
  en usage personnel.

## Alternatives écartées
- Maintenir la prudence maximale initiale : écartée, jugée contre-productive
  pour un usage mono-utilisateur expérimenté.
- Autoriser une interprétation médicale limitée sur demande explicite de
  l'utilisateur : écartée, car hors de la compétence fiable du modèle.
