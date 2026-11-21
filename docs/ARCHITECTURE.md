# Comment Sillage fonctionne

Note de fond, à jour au 21 novembre 2026. Les détails de chaque décision sont dans `docs/HANDOFF.md`.

## En une phrase

Tout tourne sur le Mac de Bastien : une app Next.js (`npm start`, 127.0.0.1:3000) lit Garmin, range chaque
profil dans sa propre base SQLite, calcule tout avec un moteur déterministe, et ne demande à Claude (via
l'abonnement claude.ai du Mac, sans clé API) que de **formuler** à partir d'un petit dossier chiffré, sous
contrôle.

## 1. Vue d'ensemble

```mermaid
flowchart LR
  subgraph Ext["Dehors"]
    Phone["Téléphone ou navigateur<br/>(Bastien, invités)"]
    Garmin["Garmin Connect<br/>Personal API"]
    Claude["Compte claude.ai de Bastien<br/>(fenêtres 5 h et 7 jours)"]
  end

  Funnel["Tailscale Funnel<br/>adresse HTTPS .ts.net"]

  subgraph Mac["Mac de Bastien"]
    subgraph App["App Next.js, port 3000"]
      Proxy["proxy.ts + profiles/request.ts<br/>cookie de session → profil"]
      Pages["Pages et routes /api<br/>(tableau de bord, séance, coach, objectif, paramètres)"]
      Sync["Synchro Garmin<br/>sync-service → sync.ts → source/garmin"]
      Engine["Moteur déterministe (src/lib/engine)<br/>zones, verdict, comparables, consignes, charge"]
      Payload["Dossier compact<br/>session-coach, outlook-coach, chat-coach"]
      Guard["Garde du quota<br/>server/quota.ts + profiles/quota.ts"]
      CoachSvc["coach-service / chat-service<br/>cache par empreinte, 2 essais"]
      Checker["Garde-fou des chiffres<br/>number-guard.ts"]
      Quality["Contrôle de cohérence (règles)<br/>quality/coherence.ts"]
      SDK["Client Agent SDK<br/>claude-agent-client.ts"]
    end
    Registry[("Registre sillage.db<br/>profils, sessions, invitations,<br/>réglages, état du quota, retours")]
    DBs[("Une base par profil<br/>run-insights.db (Bastien),<br/>profiles/&lt;id&gt;.db (invités)")]
    CLI["CLI Claude Code<br/>(connecté au compte)"]
    Night["Tâches de fond<br/>banc de nuit, bilan Opus, relecture Haiku"]
  end

  Phone -- HTTPS --> Funnel --> Proxy --> Pages
  Proxy <--> Registry
  Pages --> Sync --> Garmin
  Sync --> DBs
  Pages --> Engine
  DBs --> Engine --> Payload --> CoachSvc
  CoachSvc --> Guard
  Guard <--> Registry
  CoachSvc --> SDK --> CLI --> Claude
  SDK -- réponse JSON --> Checker --> CoachSvc
  CoachSvc --> DBs
  CoachSvc -.-> Quality
  Night --> SDK
  Night --> Guard
```

## 2. Les briques, une par une

| Brique | Ce qu'elle fait | Où |
| --- | --- | --- |
| Accès depuis l'extérieur | Tailscale Funnel publie le Mac sur une adresse HTTPS stable ; l'app n'écoute que 127.0.0.1. | `docs/ACCES.md` |
| Connexion | Lien d'invitation à usage unique ou code ; cookie `sillage_session` par appareil (seule l'empreinte est stockée) ; freinage des essais ratés. Chaque page passe par `asMember` / `asAdmin`. | `src/proxy.ts`, `profiles/request.ts`, `profiles/registry.ts` |
| Registre commun | Liste des profils, sessions, invitations, réglages, plafonds, état de l'abonnement Claude, retours. | `data/sillage.db` |
| Base par profil | Activités, séries, bien-être, objectif, analyses du coach, consommation. Un invité ne voit jamais la base d'un autre. | `db/client.ts` (`getDbFor`), `data/profiles/*.db` |
| Synchro Garmin | Une clé par profil (`GARMIN_API_KEY`, `GARMIN_API_KEY_<ID>`), résumés puis séries détaillées par lots ; toute réponse validée par Zod. | `server/sync-service.ts`, `sync/sync.ts`, `source/garmin/*` |
| Moteur | Tout ce qui est chiffré : type de séance, répétitions, zones, comparables, verdict, consigne « prochaine fois », charge, objectif. Fonctions pures, testées, zéro token. | `src/lib/engine/*`, `server/analytics.ts` |
| Dossier compact | Ce que Claude reçoit : quelques centaines de lignes de synthèse, jamais de séries brutes ni de GPS. | `coach/session-coach.ts`, `outlook-coach.ts`, `chat-coach.ts` |
| Cache | Empreinte (version du prompt + dossier) : une analyse déjà faite ne coûte rien. Jamais d'appel au chargement d'une page, seulement sur bouton (ou après une synchro). | `coach-service.ts`, table `coach_outputs` |
| Garde du quota | Avant tout appel réel : plafonds de l'invité (jour, semaine), plafond commun des invités, et arrêt si l'abonnement de Bastien dépasse 60 % sur 5 h ou 70 % sur 7 jours. Bastien n'a pas de plafond. | `server/quota.ts`, `profiles/quota.ts` |
| Coach | Agent SDK qui pilote le CLI Claude Code du Mac, connecté au compte claude.ai : aucun outil, aucune clé API. Sonnet par défaut (imposé aux invités), Opus pour le bilan, Haiku pour la relecture. | `coach/claude-agent-client.ts`, `coach/index.ts` |
| Garde-fou des chiffres | Chaque chiffre écrit par Claude doit exister dans le dossier ; zone cohérente avec la FC ; pas de cause ni de jugement d'état inventés. Sinon second essai, puis refus (l'analyse chiffrée reste affichée). | `coach/number-guard.ts` |
| Contrôle de cohérence | Règles sur l'analyse affichée (allure facile, type de séance, tutoiement / vouvoiement…). Les écarts vont dans `quality_findings`. | `quality/coherence.ts`, `server/quality-service.ts` |
| Relecture Haiku | Par lot, sur bouton ou la nuit : relit les analyses récentes de tous les profils et note les défauts. Sous les plafonds du travail automatique. | `coach/quality-review.ts`, `server/quality-review-service.ts` |
| Banc de nuit et bilan | Variantes de prompt comparées sur un jeu figé, jugées par Opus ; bilan hebdomadaire Opus. Lancés à la main par Bastien, plafonnés (40 k par nuit, 100 k par semaine, arrêt à 60 % / 70 %). | `src/lib/bench/*`, `scripts/nightly.ts`, `coach/weekly-review.ts` |

## 3. Une analyse demandée par un invité

```mermaid
sequenceDiagram
  autonumber
  actor M as Invité (téléphone)
  participant A as App (Mac)
  participant C as Cache (base de l'invité)
  participant Q as Garde du quota
  participant U as Relevé /usage (sans token)
  participant S as Agent SDK → CLI → Claude
  participant G as Garde-fou des chiffres

  M->>A: ouvre une séance
  A->>A: moteur : métriques, verdict, consignes (0 token)
  A->>U: relevé de l'abonnement si > 5 min
  A-->>M: page + jauge de l'abonnement
  M->>A: « Analyser cette séance »
  A->>C: empreinte déjà analysée ?
  alt déjà en cache
    C-->>M: analyse affichée, rien consommé
  else nouvel appel
    A->>U: relevé si > 2 min
    A->>Q: plafonds invité, plafond commun, 60 % 5 h / 70 % 7 j
    alt refusé
      Q-->>M: message positif, chiffres toujours visibles
    else permis
      A->>S: dossier compact (≈ 3 à 9 k tokens)
      S-->>A: réponse JSON + tokens consommés
      A->>G: chaque chiffre est-il dans le dossier ?
      alt chiffres inventés
        A->>S: second essai avec la liste des erreurs
      end
      A->>C: sauvegarde + consommation tracée
      A->>U: relevé complet en arrière-plan
      A-->>M: analyse affichée
    end
  end
```

## 4. La jauge de l'abonnement (corrigée le 21 nov.)

```mermaid
flowchart TD
  P["Page d'un invité, appel du coach,<br/>banc ou relecture"] --> R{"Relevé de moins de<br/>5 min (page) ou 2 min (appel) ?"}
  R -- oui --> J
  R -- non --> F["fetchPlanWindows : le CLI lit /usage<br/>sur le compte claude.ai, sans modèle ni token (≈ 1 s)"]
  F --> St["Registre : claude_rate_limits<br/>+ claude_rate_limits_checked_at"]
  E["Chaque appel du coach :<br/>rate_limit_event du SDK (une fenêtre, % seulement en alerte)"] --> St
  St --> J["subscriptionGauge : fenêtre la plus chargée / seuil d'arrêt invités"]
  J --> L{"Niveau"}
  L --> L1["large : moins de 75 % du seuil"]
  L --> L2["à ménager : 75 à 100 %<br/>(dès 50 % si le relevé a plus de 30 min)"]
  L --> L3["presque plein : coach en pause pour les invités"]
```

Avant la correction, l'app ne connaissait l'abonnement que par l'événement que le SDK joint à chaque
appel du coach. Cet événement ne porte qu'une fenêtre et ne donne le pourcentage qu'en cas d'alerte ;
la dernière valeur de la semaine datait du 16 novembre et, une fois sa remise à zéro passée, la jauge
retombait sur « large ». Elle ignorait aussi tout ce que Bastien consomme ailleurs (Claude Code, claude.ai).
Désormais, le CLI lit le même relevé que `/usage` (toutes fenêtres, en pourcentage, toute l'utilisation
du compte comprise) sans consommer de quota. API marquée expérimentale par le SDK : si elle cesse de
répondre, la jauge garde le dernier relevé, devient prudente et le dit (« dernier relevé il y a X »).
