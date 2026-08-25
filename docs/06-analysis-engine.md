
# Moteur d'analyse

## Principe

Le moteur produit des métriques observables.
Il ne doit pas produire d'interprétation médicale ou non vérifiable.

## Métriques V0

### Activité globale

- distance
- durée
- allure moyenne
- fréquence cardiaque moyenne et maximale
- cadence moyenne
- dénivelé
- température si disponible

### Intervalles

- nombre d'intervalles
- durée et distance par intervalle
- allure moyenne et médiane
- fréquence cardiaque moyenne et maximale
- cadence moyenne
- récupération entre intervalles

### Régularité

- écart type et coefficient de variation de l'allure
- différence entre première et dernière répétition
- différence entre première moitié et seconde moitié
- évolution de la cadence
- évolution de la fréquence cardiaque

### Qualité des données

- données manquantes
- pauses
- GPS instable
- FC absente ou incohérente
- laps insuffisants pour une comparaison

## Comparaison historique V0

Une activité comparable est une activité :
- de type course ;
- avec une durée ou une distance proche ;
- contenant une structure d'intervalles similaire si disponible ;
- suffisamment récente, selon une fenêtre configurable.

La logique doit être explicite et testée.
