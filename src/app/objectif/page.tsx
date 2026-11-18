import { asMember } from "@/lib/profiles/request";
import type { Member } from "@/lib/profiles/types";
import { GoalForm } from "@/components/goal/goal-form";
import { GoalStatusList } from "@/components/goal/goal-status";
import { getDashboard } from "@/lib/server/analytics";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { EMPTY_GOAL, GOAL_KEY, goalSchema } from "@/lib/goal/goal";
import { registerForRole, say } from "@/lib/register";

export const dynamic = "force-dynamic";

export default async function GoalPage() {
  return asMember((member) => renderGoalPage(member));
}

function renderGoalPage(member: Member) {
  const register = registerForRole(member.role);
  const goal = createAppStateRepository().get(GOAL_KEY, goalSchema) ?? EMPTY_GOAL;
  const dashboard = getDashboard();
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Objectif</p>
          <h1 className="page-title">{say(register, "Ce que tu vises", "Ce que vous visez")}</h1>
          <p className="page-sub">{say(register, "Le coach s'en sert pour choisir la prochaine séance et juger tes séances. Tout est facultatif.", "Le coach s'en sert pour choisir la prochaine séance et juger vos séances. Tout est facultatif.")}</p>
        </div>
      </div>
      {dashboard.goalMarkers.length ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 className="section-title">{say(register, "Où tu en es", "Où vous en êtes")}</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>{say(register, "Repère du moment : fourchette entre l'estimation tirée de ton seuil (celui de la montre, ou celui de tes répétitions longues au seuil des 8 dernières semaines s'il est nettement plus rapide) et celle tirée de tes répétitions VO2max des 12 dernières semaines. Dessous, ce qui te sépare de l'objectif.", "Repère du moment : fourchette entre l'estimation tirée de votre seuil (celui de la montre, ou celui de vos répétitions longues au seuil des 8 dernières semaines s'il est nettement plus rapide) et celle tirée de vos répétitions VO2max des 12 dernières semaines. Dessous, ce qui vous sépare de l'objectif.")}</p>
          <GoalStatusList markers={dashboard.goalMarkers} gaps={dashboard.goalGaps} goal={dashboard.goal} today={dashboard.today} />
        </section>
      ) : null}
      <GoalForm initial={goal} />
    </>
  );
}
