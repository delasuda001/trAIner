import { asMember } from "@/lib/profiles/request";
import type { Member } from "@/lib/profiles/types";
import { CoachChat } from "@/components/coach/coach-chat";
import { createChatRepository } from "@/lib/db/repositories/chat-repository";
import { formatDuration } from "@/lib/formatters";
import { getDashboard } from "@/lib/server/analytics";
import { registerForRole, say } from "@/lib/register";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  return asMember((member) => renderCoachPage(member));
}

function renderCoachPage(member: Member) {
  const register = registerForRole(member.role);
  const dashboard = getDashboard();
  const goal = dashboard.goal;
  // Ce que le coach a sous les yeux, en clair : l'athlète sait sur quoi repose la réponse.
  const seen = [
    goal && (goal.title || goal.eventDate) ? `Objectif : ${goal.title || "course"}, ${goal.runsPerWeek} sortie${goal.runsPerWeek > 1 ? "s" : ""}/semaine` : "Pas d'objectif renseigné",
    `Prochaine séance : ${dashboard.suggestion.primary.title}${dashboard.suggestion.primary.durationMin ? ` (${formatDuration(dashboard.suggestion.primary.durationMin * 60)})` : ""}, ${dashboard.suggestion.when.label.toLowerCase()}`,
    `Progression : ${dashboard.progression.state === "insufficient" ? "pas assez de données" : dashboard.progression.state === "progressing" ? "en progression" : dashboard.progression.state === "regressing" ? "en recul" : "stable"}`,
    `Charge Garmin des 7 derniers jours : ${dashboard.load.acute7d} (moyenne ${dashboard.load.chronicWeekly28d}/sem.)`,
    "Récupération du jour : VFC, FC de repos, sommeil",
    say(register, "Tes 6 dernières courses, avec ton ressenti", "Vos 6 dernières courses, avec votre ressenti"),
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Coach</p>
          <h1 className="page-title">Demander au coach</h1>
          <p className="page-sub">{say(register, "Pose ta question comme à ton coach : il connaît ton plan, tes séances et ton ressenti.", "Posez votre question comme à votre coach : il connaît votre plan, vos séances et votre ressenti.")}</p>
        </div>
      </div>
      <CoachChat initial={createChatRepository().list()} seen={seen} />
    </>
  );
}
