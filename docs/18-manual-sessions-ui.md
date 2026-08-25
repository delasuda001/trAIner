# Activités manuelles

Les activités manuelles sont saisies depuis l'accueil pour préparer une future
visualisation de calendrier. Elles ne sont pas des activités de course et restent
stockées exclusivement dans `manual_sessions`.

## Saisie

Le formulaire demande uniquement :

- une date locale au format `YYYY-MM-DD` ;
- une discipline parmi musculation, natation, mobilité et autre ;
- une durée entière de 1 à 720 minutes ;
- un libellé facultatif de 100 caractères maximum ;
- une note facultative de 500 caractères maximum.

La date par défaut est calculée dans le fuseau du navigateur et n'est jamais
convertie en UTC. Les textes sont nettoyés avant enregistrement.

## CRUD

Les routes sont `GET` et `POST /api/manual-sessions`, puis `PATCH` et `DELETE
/api/manual-sessions/:id`. Elles utilisent exclusivement
`manual-session-repository.ts`. La suppression demande une confirmation dans
l'interface.

## Limite métier

Ces séances sont destinées au calendrier uniquement. Elles sont exclues du
volume de course, des analyses, comparaisons historiques, tendances et futurs
contextes LLM par défaut. Aucune interface ne demande de les inclure dans une
analyse.