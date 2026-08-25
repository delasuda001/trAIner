
# Sécurité et confidentialité

## Classification

Les données sportives, physiologiques et de localisation sont personnelles.
Elles doivent être traitées comme sensibles.

## Mesures MVP

- Fichier .env.local ignoré par Git.
- Variables secrètes uniquement côté serveur.
- Aucune clé dans les logs.
- Aucune clé dans le code source.
- Pas de coordonnées GPS envoyées à Gemini.
- Pas de coordonnées GPS stockées dans SQLite en V0.
- Suppression possible des notes et analyses locales.
- Base locale exclue du dépôt Git.
- Dépendances mises à jour régulièrement.

## Évolutions futures

- Authentification utilisateur.
- Chiffrement applicatif de certains champs.
- Stockage PostgreSQL.
- Row Level Security.
- Journal d'audit.
- Politique de rétention des données.
