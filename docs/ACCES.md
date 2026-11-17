# Ouvrir Sillage au test familial

Ce guide liste ce que Bastien fait lui-même, une seule fois. Les testeurs (Benoît, Charles, Marie…) n'installent rien :
ils ouvrent un lien dans Safari et ajoutent le site à leur écran d'accueil.

## Principe

- L'application tourne sur le Mac de Bastien et n'écoute que le Mac lui-même (`127.0.0.1:3000`).
- Tailscale Funnel, installé sur le Mac seulement, publie une adresse HTTPS stable du type
  `https://nom-du-mac.xxxx.ts.net` et relaie vers l'application. Rien n'est ouvert sur la box.
- La sécurité repose sur l'identification de l'application : lien d'invitation personnel à usage
  unique, code de secours long, sessions par appareil révocables, freinage des essais, journal des
  connexions, plafonds de consommation du coach par invité.
- Le Mac doit rester allumé et l'application lancée pendant le test.

## 1. Relancer l'application (nouvelle version)

```bash
npm run build && npm start
```

Puis ouvrir, sur le Mac, le lien d'entrée de Bastien (usage unique, valable 7 jours) :

```bash
npm run profiles -- invitation
```

Dans Paramètres, sur le profil « Bastien », créer un code de secours et le garder (gestionnaire de
mots de passe). Les données de Bastien sont inchangées (sauvegarde :
`data/backups/run-insights-2026-11-16-pre-profiles.db`).

## 2. Tailscale sur le Mac (à faire avec l'accord écrit de Bastien)

1. Installer Tailscale pour macOS depuis https://tailscale.com/download (variante « Standalone » ou
   App Store : les deux savent relayer un port) et créer un compte (connexion Google, Apple…).
2. Dans la console d'administration Tailscale, onglet DNS : activer MagicDNS et les certificats HTTPS.
3. Rendre la commande `tailscale` disponible dans le terminal (menu Tailscale → Settings → « Install
   CLI », ou `alias tailscale=/Applications/Tailscale.app/Contents/MacOS/Tailscale`), puis :

   ```bash
   tailscale funnel --bg 3000
   ```

   La première fois, une page web demande d'autoriser Funnel. La commande affiche l'adresse publique.
   Avec `--bg`, le relais reprend tout seul après un redémarrage.
4. Dans Sillage → Paramètres → « Accès depuis l'extérieur » : coller cette adresse (elle sert aux
   liens d'invitation).

Pour Android (Bastien) : ouvrir dans Chrome un lien d'invitation créé pour son profil, puis
menu ⋮ → « Ajouter à l'écran d'accueil ».

## 3. Les clés Garmin des testeurs

Chacun crée sa clé sur https://connect.garmin.com/app/settings/personalApiToken (Bastien les guide)
et la lui transmet par un canal privé. Bastien l'ajoute à `.env.local` sous le nom indiqué dans
Paramètres, par exemple :

```
GARMIN_API_KEY_BENOIT=...
GARMIN_API_KEY_CHARLES=...
GARMIN_API_KEY_MARIE=...
```

Puis « Vérifier la clé » dans Paramètres (aucune relance nécessaire). La clé n'est jamais affichée.

## 4. Créer les profils et envoyer les liens

Paramètres → « Ajouter une personne » : le prénom affiché. L'application affiche UNE fois le lien
d'invitation (usage unique, 7 jours) et le code de secours. Envoyer le lien par SMS ou WhatsApp ;
garder le code pour le cas où l'application installée redemanderait la connexion (iPhone antérieur
à iOS 17.2).

Côté iPhone : ouvrir le lien dans Safari → l'accueil explique le test → Partager → « Sur l'écran
d'accueil » → ouvrir Sillage depuis l'icône.

## 5. Pendant le test

- Retours : page « Retours » (thèmes, pouces, export Markdown, synthèse par Claude sur bouton).
- Consommation : Paramètres (par personne ; plafonds 40 k/jour et 150 k/7 jours par invité, 250 k/7
  jours pour tous les invités ; le coach s'arrête aussi pour eux si l'abonnement dépasse 60 % sur 5 h
  ou 70 % sur 7 jours).
- Un appareil perdu : Paramètres → « Déconnecter ».

## 6. Couper

- Les invités seulement : Paramètres → « Couper l'accès » (réversible d'un clic).
- Tout l'accès extérieur : `tailscale funnel --https=443 off`.
