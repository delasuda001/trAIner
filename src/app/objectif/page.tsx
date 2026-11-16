import { asMember } from "@/lib/profiles/request";
import type { Member } from "@/lib/profiles/types";
import { GoalForm } from "@/components/goal/goal-form";
import { GoalStatusList } from "@/components/goal/goal-status";
import { getDashboard } from "@/lib/server/analytics";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { EMPTY_GOAL, GOAL_KEY, goalSchema } from "@/lib/goal/goal";

export const dynamic = "force-dynamic";

export default async function GoalPage() {
  return asMember((member) => renderGoalPage(member));
}

function renderGoalPage(member: Member) {
  void member;
  const goal = createAppStateRepository().get(GOAL_KEY, goalSchema) ?? EMPTY_GOAL;
  const dashboard = getDashboard();
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Objectif</p>
          <h1 className="page-title">Ce que tu vises</h1>
          <p className="page-sub">Le coach s&apos;en sert pour choisir la prochaine séance et juger tes séances. Tout est facultatif.</p>
        </div>
      </div>
      {dashboard.goalMarkers.length ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Où tu en es</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>Repère du moment : fourchette entre l&apos;estimation tirée de ton seuil montre et celle tirée de tes répétitions longues des 12 dernières semaines.</p>
          <GoalStatusList markers={dashboard.goalMarkers} goal={dashboard.goal} today={dashboard.today} />
        </section>
      ) : null}
      <GoalForm initial={goal} />
    </>
  );
}
