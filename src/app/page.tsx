import { CoachRequest } from "@/components/coach-request";
import { IntensityCard, LastSessionCard, ProgressionCard, RecentList, RecoveryRow, SuggestionCard, VolumeCard } from "@/components/dashboard/cards";
import { formatDate } from "@/lib/formatters";
import { getDashboard } from "@/lib/server/analytics";
import { readOutlookCoach, readSessionCoach } from "@/lib/server/coach-service";

export const dynamic = "force-dynamic";

export default function Home() {
  const dashboard = getDashboard();
  if (dashboard.activityCount === 0) {
    return (
      <div className="card state rise" style={{ marginTop: 32 }}>
        <h2>Première synchronisation</h2>
        <p>Les activités Garmin arrivent : l&apos;historique complet et les séries détaillées des courses prennent quelques minutes la première fois. La page se met à jour toute seule.</p>
      </div>
    );
  }
  const outlook = readOutlookCoach(dashboard);
  const lastCoach = dashboard.lastRun ? readSessionCoach(dashboard.lastRun) : null;
  const weekday = formatDate(dashboard.today, "long");
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">{weekday}</p>
          <h1 className="page-title">Ta forme, <mark>ta prochaine séance</mark></h1>
        </div>
        {outlook.status !== "ready" ? <CoachRequest endpoint="/api/coach/outlook" label="Demander l'avis du coach" initialError={outlook.status === "error" ? outlook.message : null} /> : null}
      </div>

      <div className="grid grid-2">
        <SuggestionCard dashboard={dashboard} coach={outlook} />
        <ProgressionCard dashboard={dashboard} coach={outlook} />
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Forme et récupération</h2>
          <span className="section-note">Comparé à ta propre base, jamais à une norme</span>
        </div>
        <RecoveryRow dashboard={dashboard} />
      </section>

      <section className="section">
        <LastSessionCard dashboard={dashboard} coach={lastCoach} />
      </section>

      <section className="section grid grid-main-side" style={{ alignItems: "start" }}>
        <div className="stack">
          <VolumeCard dashboard={dashboard} />
          <IntensityCard dashboard={dashboard} />
        </div>
        <RecentList dashboard={dashboard} />
      </section>
    </>
  );
}
