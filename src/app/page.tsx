import { asMember } from "@/lib/profiles/request";
import type { Member } from "@/lib/profiles/types";
import { CoachRequest } from "@/components/coach-request";
import { IntensityCard, LastSessionCard, MissingInfo, MobileGlance, ProgressionCard, RecentList, RecoveryRow, SuggestionCard, VolumeCard } from "@/components/dashboard/cards";
import { SessionCalendar } from "@/components/dashboard/session-calendar";
import { formatDate } from "@/lib/formatters";
import { getDashboard } from "@/lib/server/analytics";
import { readPrepareStatus } from "@/lib/server/prepare-service";
import { PreparingNotice } from "@/components/profiles/welcome-steps";
import { readOutlookCoach, readSessionCoach } from "@/lib/server/coach-service";
import { registerForRole, say } from "@/lib/register";

export const dynamic = "force-dynamic";

export default async function Home() {
  return asMember((member) => renderHome(member));
}

function renderHome(member: Member) {
  const dashboard = getDashboard();
  if (dashboard.activityCount === 0 && member.role === "guest") {
    const status = readPrepareStatus(member.id);
    return <div className="welcome rise"><PreparingNotice stage={status?.stage ?? null} activities={status?.activities ?? 0} /></div>;
  }
  if (dashboard.activityCount === 0) {
    return (
      <div className="card state rise" style={{ marginTop: 32 }}>
        <h2>Première synchronisation</h2>
        <p>Les activités Garmin arrivent : l&apos;historique et les séries détaillées des courses prennent quelques minutes la première fois. La page se met à jour toute seule. Si rien n&apos;arrive, le bandeau en haut dit pourquoi.</p>
      </div>
    );
  }
  const outlook = readOutlookCoach(dashboard);
  const lastCoach = dashboard.lastRun ? readSessionCoach(dashboard.lastRun) : null;
  const weekday = formatDate(dashboard.today, "long");
  const register = registerForRole(member.role);
  return (
    <>
      <div className="page-head home-head">
        <div>
          <p className="eyebrow">{weekday}</p>
          <h1 className="page-title">{say(register, "Ta forme", "Votre forme")}, <mark>{say(register, "ta prochaine séance", "votre prochaine séance")}</mark></h1>
        </div>
        {outlook.status !== "ready" ? <CoachRequest endpoint="/api/coach/outlook" label="Demander l'avis du coach" queueLabel="Conseil du jour du coach" initialError={outlook.status === "error" ? outlook.message : null} /> : null}
      </div>

      <MobileGlance dashboard={dashboard} />

      {/* Hauteurs naturelles : la carte jaune ne s'étire plus, le calendrier remplit sa colonne. */}
      <div className="grid grid-2 home-hero">
        <div className="stack">
          <SuggestionCard dashboard={dashboard} coach={outlook} />
          <SessionCalendar calendar={dashboard.calendar} />
        </div>
        <ProgressionCard dashboard={dashboard} coach={outlook} />
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Forme et récupération</h2>
          <span className="section-note">{say(register, "Comparé à ta propre base, jamais à une norme", "Comparé à votre propre base, jamais à une norme")}</span>
        </div>
        <RecoveryRow dashboard={dashboard} />
      </section>

      <MissingInfo dashboard={dashboard} />

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
