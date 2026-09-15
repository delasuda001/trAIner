
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
   - points clés (encart distinct, en tête) ;
   - recommandations techniques et allure cible (visibles) ;
   - hypothèses ;
   - section repliable « Voir le détail complet » : faits observés,
     classification en zones, comparaison historique, limites, prochaines
     étapes, note de sécurité si présente, sources utilisées.

## Écran 3 bis : Débrief IA (révisé)

Toujours visibles, dans l'ordre :
- **bandeau « logique obsolète »** si `logicStale` (prompt_version stocké ≠
  version courante) et que la forme reste valide : « Généré avec une version
  antérieure de l'analyse… Régénérez pour bénéficier des dernières
  améliorations. » Discret, non bloquant, le contenu reste affiché ;
- **provenance du seuil** (`ThresholdProvenance`) : allure seuil utilisée,
  niveau de confiance en toutes lettres, fenêtre d'estimation (« estimée sur
  vos N dernières semaines ») et rappel « pas seulement cette séance » avec le
  nombre d'efforts retenus. Si l'estimation calculée est trop faible et qu'un
  repère de performance a été déclaré, la ligne indique que le débrief s'appuie
  sur ce repère déclaré. Rendu à partir du bloc `thresholdEstimate` renvoyé par
  la route, pas seulement du texte du modèle ;
- **note de péremption neutre**, affichée **dès qu'un des efforts retenus a
  plus de 8 semaines, quelle que soit la confiance** (ex. « 3 des 5 efforts
  retenus datent de plus de 8 semaines (le plus ancien : 19 semaines). ») —
  ferme le cas « confiance bonne mais ancrage tempo/long périmé ». Ce n'est pas
  le bandeau alarmant ci-dessous ;
- **bandeau discret alarmant** si `confidenceLevel` vaut `insufficient` ou
  `low`, placé avant le débrief : message de fraîcheur en français, durées de
  zone à couvrir, séances suggérées pour combler les manques, indice de biais,
  et la liste des **efforts écartés** avec leur motif ;
- `key_takeaways` : 1 à 3 points clés en langage simple, dans un encart
  distinct ;
- recommandations techniques ;
- allure cible pour la prochaine séance similaire (bloc visible, pas masqué
  derrière un accordéon) ;
- hypothèses.

Section repliable par défaut (« Voir le détail complet ») :
- constats factuels ;
- classification en zones (le texte du modèle rappelle en plus que le seuil
  vient de l'historique récent multi-séances, ou de la référence déclarée en
  repli) ;
- comparaison historique chiffrée ;
- limites et fiabilité ;
- prochaines étapes ;
- `safety_note`, uniquement si présente dans la réponse ;
- sources utilisées (activités, métriques).

Il n'y a plus de section « questions à considérer » : les clarifications de
fiabilité sont fondues dans les limites.

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
