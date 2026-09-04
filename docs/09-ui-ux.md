
# UX et UI

## Principe directeur

L'application doit transformer des données d'entraînement complexes en une lecture
rapide, vérifiable et actionnable.

L'interface ne doit pas chercher à afficher toutes les métriques disponibles.
Elle doit aider l'utilisateur à répondre à trois questions :

1. Qu'ai-je fait ?
2. Qu'est-ce qui est objectivement observable ?
3. Que puis-je examiner ou tester ensuite ?

## Utilisateur

Un seul utilisateur, coureur régulier, à l'aise avec les données,
mais qui souhaite éviter une interface d'expert surchargée.

## Langue et unités

- Langue : français.
- Distance : kilomètres.
- Allure : min/km.
- Fréquence cardiaque : bpm.
- Cadence : pas/minute.
- Dénivelé : mètres.
- Dates : format français.

## Navigation V0

Navigation principale :

- Tableau de bord
- Activités
- Objectifs
- Assistant
- Réglages

## Écran 1 : tableau de bord

Objectif : offrir un point d'entrée rapide vers les activités récentes
et les analyses déjà générées.

Contenu :

- titre et date du jour ;
- bouton Synchroniser les activités ;
- résumé des 7 derniers jours ;
- liste des dernières activités de course ;
- accès aux dernières analyses ;
- accès rapide aux objectifs actifs.

Le tableau de bord ne doit pas afficher de recommandation automatique en V0.

## Écran 2 : liste des activités

Objectif : trouver et sélectionner une activité.

Chaque carte d'activité affiche :

- date ;
- nom ;
- distance ;
- durée ;
- allure moyenne ;
- fréquence cardiaque moyenne si disponible ;
- dénivelé ;
- badge indiquant si une analyse existe.

Filtres V0 :

- période ;
- type de sport ;
- analysée ou non analysée.

## Écran 3 : détail d'activité

Objectif : comprendre une séance avant de demander une interprétation IA.

Structure verticale :

1. En-tête
   - nom, date, sport ;
   - distance, durée, allure moyenne ;
   - bouton Analyser cette séance.

2. Résumé des données
   - fréquence cardiaque ;
   - cadence ;
   - dénivelé ;
   - température si disponible ;
   - charge si disponible.

3. Laps ou intervalles
   - tableau lisible ;
   - distance ;
   - durée ;
   - allure ;
   - fréquence cardiaque ;
   - cadence ;
   - récupération.

4. Courbes
   - allure ;
   - fréquence cardiaque ;
   - cadence ;
   - altitude ;
   - curseur synchronisé entre graphiques.

5. Contexte personnel
   - objectif de séance ;
   - effort perçu ;
   - fatigue inhabituelle ;
   - douleur ou gêne signalée ;
   - note libre.

6. Résultats déterministes
   - régularité ;
   - évolution entre début et fin ;
   - qualité des données ;
   - comparaison disponible ou insuffisante.

7. Débrief IA
   - uniquement après action explicite de l'utilisateur ;
   - faits observés ;
   - comparaison historique ;
   - hypothèses ;
   - limites ;
   - pistes à examiner ;
   - sources utilisées.

## Écran 3 bis : Débrief IA (révisé)

Sections affichées, dans l'ordre :
- constats factuels ;
- classification en zones (avec allure/FC seuil utilisée et son niveau de
  confiance affiché explicitement, ex. "confiance : faible — 2 séances
  qualité manquantes") ;
- comparaison historique chiffrée ;
- recommandations techniques et allure cible pour la prochaine séance
  similaire (nouveau bloc visible, pas masqué derrière un accordéon) ;
- hypothèses et limites ;
- safety_note, affichée uniquement si présente dans la réponse ;
- sources utilisées (activités, métriques).

Si la confiance de l'estimation de seuil est `insufficient` ou `low`,
afficher un bandeau discret suggérant le type de séance à réaliser pour
l'améliorer, avant même le débrief.

## Écran 4 : objectifs

Objectif : visualiser des objectifs actifs et explorer leur progression.

Chaque objectif affiche :

- titre ;
- statut ;
- période ;
- métrique suivie ;
- dernière observation disponible ;
- niveau de données disponibles ;
- bouton Poser une question sur cet objectif.

L'application ne présente jamais un objectif de cadence comme une norme universelle.

## Écran 5 : assistant

Objectif : permettre des questions fondées sur les données.

Exemples de suggestions :

- Cette séance était-elle cohérente avec mon objectif actuel ?
- Comment ma cadence évolue-t-elle sur les sorties faciles ?
- Compare cette activité à mes dernières séances similaires.
- Quelles données manquent pour évaluer cet objectif ?

Chaque réponse affiche :

- réponse synthétique ;
- faits observés ;
- hypothèses ;
- limites ;
- activités et périodes utilisées.

## États à prévoir

Chaque écran doit gérer :

- chargement ;
- absence de données ;
- erreur Intervals.icu ;
- erreur de validation de données ;
- limite de requêtes ;
- analyse IA indisponible ;
- aucune activité comparable ;
- données insuffisantes.

## Accessibilité et ergonomie

- Interface responsive, pensée d'abord pour écran desktop.
- Contrastes suffisants.
- Graphiques accompagnés d'un tableau ou résumé textuel.
- Ne pas dépendre uniquement de la couleur.
- Boutons et libellés explicites.
- Afficher les unités systématiquement.
