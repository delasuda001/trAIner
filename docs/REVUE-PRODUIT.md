# Revue produit — Sillage vu par un coureur exigeant

18 novembre 2026. Regard extérieur, sans complaisance. Aucun appel à Claude pour cette revue : tout
vient de la base (`data/run-insights.db`), du code du moteur et d'une recherche web rapide.

## 1. La réponse courte

**Sillage, aujourd'hui, t'aide à mieux exécuter tes séances. Il ne t'aide pas encore à atteindre tes
objectifs.** Il juge très bien une séance contre tes séances passées, mais il ne dit jamais ce qui te
sépare d'un semi en 1:27 et ne te donne aucune trajectoire pour y aller. Or ton écart à l'objectif ne
se trouve pas dans l'exécution de tes fractionnés.

Ce que disent tes données (courses depuis le 15 août 2026) :

| Repère | Toi aujourd'hui | Ce que demande l'objectif |
| --- | --- | --- |
| Sorties par semaine | ~2 (une qualité en semaine, une endurance le samedi) | 3 à 4 pour un semi en 1:27 (repère d'entraîneur courant, pas une norme) |
| Volume | ~13 km/semaine (57 km en octobre) | souvent 35 à 50 km/semaine à ce niveau |
| Plus longue sortie (3 derniers mois) | 11,0 km (7 nov.) | des sorties de 16 à 20 km dans le bloc |
| Allure semi visée | 4:07/km | — |
| Seuil montre | 4:21/km à 169 bpm | autour de 4:00/km pour tenir 4:07 sur 21 km |
| Seuil observé en séance | 3 × 2 km à 4:00/km (4 nov.) ; 4:10/km à 168 bpm (13 nov.) ; comparables à 4:02/km pour 171 bpm | — |
| 5 km < 19:00 | 3:48/km ; tes répétitions de 70 s sortent à 3:45 | — |

Lecture d'entraîneur : **le moteur est là** (VO2max montre à 58, répétitions rapides, 3 × 2 km
autour de 4:00–4:10). **Ce qui manque, c'est l'endurance spécifique** : volume, fréquence, sortie
longue. Sillage n'en parle nulle part comme du levier principal. Pire, le bilan hebdomadaire d'Opus a
proposé d'arrêter de te suggérer des endurances « jamais suivies »… alors que tu fais une endurance
presque chaque samedi depuis octobre (10, 17, 24, 31 oct., 7 nov.). Le juge s'est trompé de constat
et sa règle candidate irait contre ton objectif.

Pour le 5 km sous 19:00, tu es plus proche (répétitions courtes déjà sous 3:48) : là, l'exécution
compte davantage, et Sillage est plus utile.

## 2. Ce qui différencie Sillage des autres outils

| Outil | Ce qu'il fait bien | Ce que Sillage fait mieux | Ce que Sillage ne fait pas |
| --- | --- | --- | --- |
| Garmin Connect / Garmin Coach, séances suggérées | Plan adaptatif lié à une date de course, séance du jour poussée sur la montre, prédicteur de temps | Explique une séance contre tes propres séances comparables, à FC égale | Pas de plan, rien sur la montre |
| Runna (Strava) | Plan complet par objectif, ajusté au fil des séances, synchronisé sur la montre | Retour d'exécution précis (répétition par répétition, régularité, dérive) | Pas de plan, pas d'allures par bloc |
| TrainingPeaks / intervals.icu | Charge (CTL/ATL), calendrier, analyses très riches, mais à toi de les lire | Lecture rédigée, consignes chiffrées, comparaison automatique | Pas de planification, pas de courbe de forme lisible |
| Athletica | Plan adaptatif « IA » qui suit forme et fatigue | Transparence : chaque chiffre vient du moteur, rien d'inventé | Pas de plan |
| Strava | Social, segments, historique | Tout le reste | — |

En une phrase : **les autres te disent quoi faire, Sillage te dit comment tu l'as fait.** C'est une
vraie niche (personne ne compare aussi proprement une séance à tes comparables avec correction de la
FC), mais elle est secondaire pour ton objectif semi. Un coureur à 2 sorties par semaine progresse
d'abord en courant plus, pas en partant 10 s/km moins vite sur sa première répétition de 30 s.

## 3. Les analyses du coach, jugées comme un entraîneur

Lu : 23 analyses de séance (versions v1 à v12), 8 conseils du jour, 1 bilan hebdomadaire.

**Ce qui est bon**
- Chiffré partout, sans invention (le garde-fou des nombres fonctionne).
- Comparé à l'historique, avec correction de la FC (« 8 s/km plus lent, 4 s/km à FC égale »).
  C'est le meilleur de l'outil.
- « Prochaine fois » concrète : format, allure, récupération (« 8 × 70 s à 3:46–3:52/km, 1:15 de récup »).
- Prudence correcte quand il n'y a qu'un comparable (« comparaison fragile »).

**Ce qui ne va pas**
1. **Aucun lien avec l'objectif.** Aucune analyse ne dit ce que la séance change pour le semi en
   1:27. Le conseil du jour cite « le semi » comme justification générique (« construit la base »),
   sans chiffre d'écart.
2. **Faux précision sur les répétitions courtes.** Sur le 14 × 30 s du 17 nov., le coach reproche
   une 1re répétition à 3:25/km. Sur 30 s (~150 m), le GPS se trompe facilement de 5 à 10 s/km, et
   l'accélération initiale fausse l'allure. Juger répétition par répétition sous 60 s, c'est
   commenter du bruit.
3. **Cibles probablement trop prudentes.** Elles partent du seuil montre (4:21/km). Tes 3 × 2 km
   à 4:00–4:10 pour 168–171 bpm disent que ton seuil réel est plus rapide d'environ 10 à 20 s/km.
   Résultat : le coach te demande de ralentir (« pars à 3:44, pas plus vite ») sur une séance où ta
   FC moyenne était en Z4, et te présente un objectif plus loin qu'il ne l'est.
4. **Le 3 × 2 km classé « VO2max ».** 2 km à 4:00 avec 3 min de récup, c'est du seuil
   (« cruise intervals »), la séance la plus utile pour le semi. L'étiquette fausse la cible et
   les comparables.
5. **Bavard et redondant.** Verdict, 4 puces, 3 consignes, puis un « détail » de 150 à 200 mots
   qui répète les puces. Tu lis deux fois la même chose, et ça coûte environ 1 500 tokens de sortie
   par analyse.
6. **La foulée en remplissage.** Contact au sol, oscillation, longueur de pas cités à chaque fois.
   Ça suit l'allure ; sans écart net aux comparables, ça n'apprend rien (« garde ta cadence de
   182 pas/min » comme point à reproduire n'a aucune valeur).
7. **Instable d'une génération à l'autre.** La séance du 17 nov. a été analysée 4 fois le même
   jour : « format non reconnu », puis « 0 comparable », puis « 4 comparables ». Chaque correction
   du moteur était justifiée, mais pour toi ça fait trois histoires différentes.
8. **Le bilan hebdomadaire n'est pas fiable sur les faits.** Il affirme que tu ne fais que de la
   qualité et que les endurances ne sont jamais suivies, ce que l'historique dément.

Note globale d'entraîneur : **exécution 7/10, pertinence pour l'objectif 3/10.**

## 4. Améliorations, par ordre de priorité

Coût en tokens : « 0 » = calcul du moteur seul. Les vérifications réelles se font sur ton feu vert
(une analyse ≈ 10 k tokens Sonnet).

| # | Amélioration | Où | Effort | Tokens |
| --- | --- | --- | --- | --- |
| 1 | **Écart à l'objectif** : pour chaque objectif, les 3 ou 4 leviers chiffrés (allure seuil observée / nécessaire, plus longue sortie / nécessaire, volume et sorties par semaine / repère), avec le levier principal désigné. Page Objectif, carte Progression, et une ligne dans la charge utile du coach. | moteur + UI + prompts | M | 0 ; +~100 tokens par appel ensuite |
| 2 | **Seuil observé** : déduire un seuil de tes séances (répétitions ≥ 6 min de travail continu ou 2 km+, FC ≥ seuil − 5 bpm) ; si plus rapide que la montre de ≥ 8 s/km, l'utiliser pour les cibles et l'estimation, en disant d'où il vient. | moteur | M | 0 |
| 3 | **Bruit GPS des répétitions courtes** : sous 60 s, pas de jugement répétition par répétition ni de « départ trop vite » ; seulement la moyenne, la FC et la régularité de la seconde moitié. | moteur + prompt | S | 0 |
| 4 | **Étiquette 2 km et plus** : répétitions ≥ 1 600 m ou ≥ 6 min = seuil, pas VO2max. | moteur | S | 0 |
| 5 | **Trajectoire légère vers l'objectif** (sans plan complet) : semaine type à 3 sorties (qualité, sortie longue qui grandit de ~10 % par semaine depuis ta plus longue, une courte facile de 30–40 min), et la prochaine séance en tient compte. Demande une date de course pour aller plus loin. | moteur + UI | L | 0 |
| 6 | **Analyse plus courte** : supprimer le « détail » ou le limiter à 2 phrases nouvelles ; foulée seulement si un écart aux comparables dépasse un seuil ; une ligne « ce que ça change pour l'objectif ». | prompt `session-v13` | S | −40 % de sortie par analyse |
| 7 | **Bilan hebdomadaire vérifié** : donner au juge les faits de fréquence (séances par type sur 8 semaines) et refuser une règle candidate qui contredit l'historique. | dossier + prompt | S | 0 maintenant |
| 8 | Envoi de la séance sur la montre (fichier d'entraînement) | à explorer | M–L | 0 |

Ce que je **ne** ferais **pas** : un plan complet type Runna (gros chantier, déjà bien fait ailleurs),
plus d'indicateurs de foulée, ou plus de texte.

## Sources (recherche web, 18 nov. 2026)

- Runna : [the5krunner, Runna](https://the5krunner.com/runna/), [Is Runna AI?](https://the5krunner.com/2026/09/28/is-runna-ai/)
- Garmin : [Garmin Training Plans for Runners](https://www.garmin.com/en-GB/blog/garmin-training-plans-for-runners/), [Daily Suggested Workouts](https://www8.garmin.com/manuals/webhelp/GUID-D3621248-CC5B-4F04-B004-6F6FD9FDFEB0/EN-US/GUID-AFECC098-0B34-4913-9944-66E8DAF64039.html)
- Athletica / intervals.icu : [athletica.ai](https://athletica.ai), [intégration intervals.icu](https://athletica.ai/announcing-athleticas-integration-with-intervals-icu/), [forum intervals.icu](https://forum.intervals.icu/t/ai-training-systems/28855)
