import { GoalForm } from "@/components/goal/goal-form";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { EMPTY_GOAL, GOAL_KEY, goalSchema } from "@/lib/goal/goal";

export const dynamic = "force-dynamic";

export default function GoalPage() {
  const goal = createAppStateRepository().get(GOAL_KEY, goalSchema) ?? EMPTY_GOAL;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Objectif</p>
          <h1 className="page-title">Ce que tu vises</h1>
          <p className="page-sub">Le coach s&apos;en sert pour choisir la prochaine séance et juger tes séances. Tout est facultatif.</p>
        </div>
      </div>
      <GoalForm initial={goal} />
    </>
  );
}
