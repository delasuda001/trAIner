import { Target } from "lucide-react";
import { daysBetween } from "@/lib/dates";
import { goalStatus, type GoalMarker } from "@/lib/engine/prescription";
import type { Goal } from "@/lib/goal/goal";
import { Say } from "@/components/ui/register";

/**
 * Où en est chaque objectif chiffré : dit une seule fois, ici (page Objectif et
 * carte de progression), jamais répété dans les consignes de séance.
 */
export function GoalStatusList({ markers, goal, today, compact = false }: { markers: GoalMarker[]; goal: Goal | null; today: string; compact?: boolean }) {
  if (!markers.length) return null;
  return (
    <div className="goal-status">
      {markers.map((marker) => {
        // La date de course ne vaut que pour la distance de l'objectif principal.
        const dated = goal?.eventDate && goal.distanceKm && Math.abs(goal.distanceKm - marker.estimate.distanceKm) < 0.05 ? goal.eventDate : null;
        const status = goalStatus(marker, dated, dated ? daysBetween(today, dated) : null);
        return (
          <div key={marker.race} className={`goal-status-row goal-${status.status}`}>
            <div className="goal-status-head"><Target size={13} /> <strong>{status.race} en {status.goal}</strong></div>
            <div><strong><Say tu={status.verdict} /></strong> Repère actuel : {status.current}.</div>
            {compact ? null : <div className="muted small"><Say tu={status.timing} /></div>}
          </div>
        );
      })}
    </div>
  );
}
