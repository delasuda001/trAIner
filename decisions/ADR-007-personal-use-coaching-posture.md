
# ADR-007 : Posture de coaching technique en usage personnel

## Contexte
L'application est utilisée par son unique développeur/athlète, capable de
filtrer un conseil technique non pertinent. Le positionnement initial du
MVP traitait ce cas comme un utilisateur anonyme non qualifié.

## Décision
Adapter le ton et la portée des recommandations techniques au profil réel
de l'utilisateur (coureur expérimenté), tout en conservant intactes les
protections structurelles (traçabilité des sources, distinction fait/
hypothèse, exclusion médicale stricte définie en ADR-004).

## Conséquences
- Le dashboard reste sans recommandation ambiante non sollicitée.
- Le débrief d'activité, déclenché explicitement, peut afficher des
  recommandations concrètes et argumentées.
- Toute réouverture future du produit à d'autres utilisateurs devra
  réévaluer ce positionnement (non transposable tel quel à un public non
  qualifié).

## Alternatives écartées
- Conserver un ton uniformément prudent indépendamment du profil
  utilisateur : écartée, jugée moins utile sans bénéfice de sécurité réel
  pour ce cas d'usage.
