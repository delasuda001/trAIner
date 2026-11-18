import { Target } from "lucide-react";
import { daysBetween } from "@/lib/dates";
import { goalStatus, type GoalMarker } from "@/lib/engine/prescription";
import type { GoalGap } from "@/lib/engine/goal-gap";
import type { Goal } from "@/lib/goal/goal";
import { Say } from "@/components/ui/register";

/**
 * Où en est chaque objectif chiffré : dit une seule fois, ici (page Objectif et
 * carte de progression), jamais répété dans les consignes de séance.
 */
export function GoalStatusList({ markers, gaps = [], goal, today, compact = false }: { markers: GoalMarker[]; gaps?: GoalGap[]; goal: Goal | null; today: string; compact?: boolean }) {
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
            <GapView gap={gaps.find((entry) => entry.race === marker.race) ?? null} compact={compact} />
          </div>
        );
      })}
    </div>
  );
}

/** Ce qui sépare de l'objectif : le levier principal en action chiffrée, et (page Objectif) tous les leviers. */
function GapView({ gap, compact }: { gap: GoalGap | null; compact: boolean }) {
  if (!gap) return null;
  const main = gap.levers.find((lever) => lever.key === gap.main) ?? null;
  return (
    <div className="goal-gap">
      {main && gap.action ? (
        <div className="goal-gap-action"><strong>Levier principal : {main.label.toLowerCase()}</strong> ({main.current}, repère {main.needed}). <Say tu={gap.action} /></div>
      ) : <div className="goal-gap-action"><Say tu={gap.summary} /></div>}
      {compact ? null : (
        <table className="goal-gap-table">
          <thead><tr><th>Levier (8 dernières semaines)</th><th>Toi</th><th>Repère</th></tr></thead>
          <tbody>
            {gap.levers.map((lever) => (
              <tr key={lever.key} className={lever.met ? "met" : lever.key === gap.main ? "main" : ""}>
                <td>{lever.label}</td><td className="num">{lever.current}</td><td className="num">{lever.needed}{lever.met ? " ✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {compact ? null : <div className="muted small">Repères d&apos;entraîneur courants pour ce temps, pas des normes : ils disent où se trouve l&apos;écart, pas ce qui est obligatoire.</div>}
    </div>
  );
}
