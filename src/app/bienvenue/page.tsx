import { Check, MessageCircle, Route, ShieldCheck, Sparkles, X } from "lucide-react";
import { CoachGaugeLine } from "@/components/coach/coach-gauge";
import { PrivacyNotice } from "@/components/profiles/privacy-notice";
import { InstallHint, PreparingNotice, WelcomeDone } from "@/components/profiles/welcome-steps";
import { formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import { asMember } from "@/lib/profiles/request";
import type { Member } from "@/lib/profiles/types";
import { getDashboard, loadContext } from "@/lib/server/analytics";
import { readSessionCoach } from "@/lib/server/coach-service";
import { readPrepareStatus } from "@/lib/server/prepare-service";
import { trainingOptOut } from "@/lib/server/profiles-admin";
import { welcomeHighlights } from "@/lib/welcome/highlights";

export const dynamic = "force-dynamic";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * Accueil d'un testeur à sa première ouverture : son espace est déjà prêt (préparé
 * par Bastien), on lui montre ses propres chiffres, ce qu'il peut faire et ce que
 * Sillage ne fait pas, puis il part sur son tableau de bord. Rien sur la connexion.
 */
export default async function WelcomePage() {
  return asMember((member) => renderWelcome(member));
}

function renderWelcome(member: Member) {
  const dashboard = getDashboard();
  if (dashboard.activityCount === 0) {
    const status = readPrepareStatus(member.id);
    return (
      <div className="welcome rise">
        <p className="eyebrow">Bienvenue</p>
        <h1 className="page-title">Bonjour {member.name}</h1>
        <PreparingNotice stage={status?.stage ?? null} activities={status?.activities ?? 0} />
      </div>
    );
  }
  const context = loadContext();
  const highlights = welcomeHighlights(context.runs, dashboard.today);
  const last = dashboard.recent.find((run) => run.id === dashboard.lastRun?.activity.id) ?? null;
  const lastAnalyzed = dashboard.lastRun ? readSessionCoach(dashboard.lastRun).status === "ready" : false;
  const { progression, suggestion } = dashboard;
  const gain = progression.paceGainSPerKm;
  const hasGoal = dashboard.goal != null;
  const bestMonth = highlights.bestMonth ? `${MONTHS[Number(highlights.bestMonth.month.slice(5, 7)) - 1]} : ${highlights.bestMonth.km} km` : null;

  return (
    <div className="welcome rise">
      <p className="eyebrow">Bienvenue dans Sillage</p>
      <h1 className="page-title">Bonjour {member.name}, <mark>votre espace est prêt.</mark></h1>
      <p className="page-sub">Vos 12 derniers mois Garmin sont déjà importés et analysés. Voici ce qu&apos;en retient Sillage.</p>

      <section className="welcome-stats" aria-label="Vos chiffres marquants">
        <div className="welcome-stat">
          <div className="card-eyebrow">12 derniers mois</div>
          <div className="glance-big">{formatNumber(highlights.km)}<span className="unit">km</span></div>
          <p className="glance-line">{highlights.runs} courses, {highlights.hours} h de course, {highlights.activeWeeks} semaines sur 52{bestMonth ? ` · meilleur mois, ${bestMonth}` : ""}</p>
        </div>
        <div className="welcome-stat">
          <div className="card-eyebrow">À fréquence cardiaque égale</div>
          {progression.state !== "insufficient" && progression.recent.speedAtReferenceHr ? (
            <>
              <div className="glance-big">{formatPace(progression.recent.speedAtReferenceHr).replace("/km", "")}<span className="unit">/km à {progression.referenceHeartRateBpm} bpm</span></div>
              <p className="glance-line">{gain == null || Math.abs(gain) < 1 ? "Même allure" : `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"}`} que les {progression.windowWeeks} semaines d&apos;avant</p>
            </>
          ) : (
            <>
              <div className="glance-big">{highlights.longestKm != null ? formatNumber(highlights.longestKm, 1) : "—"}<span className="unit">km</span></div>
              <p className="glance-line">votre plus longue sortie de l&apos;année ; la tendance à FC égale apparaîtra après quelques sorties faciles</p>
            </>
          )}
        </div>
        {last ? (
          <a className="welcome-stat" href={`/activities/${encodeURIComponent(last.id)}`}>
            <div className="card-eyebrow">Dernière séance · {formatDate(last.localDate, "short")}</div>
            <div className="welcome-stat-title">{last.title ?? last.name}</div>
            <p className="glance-line">{[formatDistance(last.distanceM), last.movingTimeS ? formatDuration(last.movingTimeS) : null, last.averageSpeedMps ? formatPace(last.averageSpeedMps) : null].filter(Boolean).join(" · ")}</p>
            <p className="glance-line">{lastAnalyzed ? <><Sparkles size={13} /> Déjà commentée par le coach</> : "À ouvrir : chiffres, comparaisons et points à travailler"}</p>
          </a>
        ) : null}
      </section>

      <section className="card welcome-next">
        <div className="card-eyebrow">Votre prochaine séance · {suggestion.when.label}</div>
        <div className="welcome-stat-title">{suggestion.primary.title}{suggestion.primary.durationMin ? ` · ${formatDuration(suggestion.primary.durationMin * 60)}` : ""}</div>
        <p className="small" style={{ margin: "4px 0 0" }}>{suggestion.reason}</p>
      </section>

      <div className="welcome-two">
        <section className="card welcome-card">
          <h2 className="section-title">Vous pouvez</h2>
          <ul className="welcome-list">
            <li><Route size={15} /> Ouvrir chaque séance : ce qui a marché, ce qui est à travailler, chiffres à l&apos;appui.</li>
            <li><Check size={15} /> Suivre la séance proposée et votre progression, comparée à vous-même.</li>
            <li><MessageCircle size={15} /> Poser une question au coach, ou lui signaler une contrainte.</li>
          </ul>
        </section>
        <section className="card welcome-card">
          <h2 className="section-title">Sillage ne fait pas</h2>
          <ul className="welcome-list muted-list">
            <li><X size={15} /> D&apos;avis médical : une douleur relève d&apos;un médecin.</li>
            <li><X size={15} /> De plan imposé : il propose, vous décidez.</li>
            <li><ShieldCheck size={15} /> D&apos;usage d&apos;autres données que vos données Garmin.</li>
          </ul>
        </section>
      </div>

      <section className="card welcome-card">
        <h2 className="section-title">Le coach, une ressource partagée</h2>
        <p className="small">Vos chiffres sont calculés pour chaque séance, sans limite. Les commentaires du coach passent par l&apos;abonnement Claude de Bastien : la jauge indique la marge disponible avant d&apos;en demander.</p>
        <CoachGaugeLine />
      </section>

      <PrivacyNotice trainingOptOut={trainingOptOut()} />

      <details className="card welcome-card welcome-install">
        <summary><strong>Installer Sillage sur votre téléphone comme une application</strong></summary>
        <InstallHint />
      </details>

      <WelcomeDone hasGoal={hasGoal} />
      <p className="muted small" style={{ textAlign: "center" }}>Une idée, un bug, une suggestion ? Le bouton « Un retour ? », en bas à droite, est disponible à tout moment.</p>
    </div>
  );
}
