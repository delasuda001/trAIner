import { ArrowRight, Gauge, Target } from "lucide-react";
import Link from "next/link";
import { VerdictMark } from "./cards";
import { Say } from "@/components/ui/register";
import { progressionVerdict } from "@/lib/engine/explain";
import type { GoalGap } from "@/lib/engine/goal-gap";
import type { GoalMarker } from "@/lib/engine/prescription";
import { formatClock, formatPace } from "@/lib/formatters";
import type { Dashboard } from "@/lib/server/analytics";

/**
 * Vue « essentiel » : ce qui sert à décider, en jauges et en couleurs plutôt qu'en
 * texte. Le détail reste à un toucher (« Voir le détail »). Les calculs sont ceux de
 * la vue complète, rien n'est recalculé ici.
 */

const LEVER_COLOR: Record<string, string> = { frequency: "var(--sl-pink)", volume: "var(--sl-blue)", long_run: "var(--sl-green)", threshold: "var(--sl-orange)" };

/** Jauge d'objectif : un levier par barre, remplie à la part du repère atteinte. */
export function GoalGauge({ gaps, markers }: { gaps: GoalGap[]; markers: GoalMarker[] }) {
  const gap = gaps[0] ?? null;
  if (!gap) {
    return (
      <section className="card essential-goal">
        <div className="card-eyebrow"><Target size={13} /> Objectif</div>
        <p className="small" style={{ margin: "6px 0 10px" }}><Say tu="Pas d'objectif chiffré : indique une distance et un temps visés pour voir ta jauge." /></p>
        <Link className="essential-link" href="/objectif">Renseigner un objectif <ArrowRight size={14} /></Link>
      </section>
    );
  }
  const marker = markers.find((entry) => entry.race === gap.race) ?? null;
  const allMet = gap.levers.every((lever) => lever.met);
  return (
    <section className="card essential-goal" aria-labelledby="goal-gauge-title">
      <div className="card-eyebrow"><Target size={13} /> Objectif</div>
      <h2 id="goal-gauge-title" className="essential-goal-title">{gap.race.charAt(0).toUpperCase() + gap.race.slice(1)} en {formatClock(gap.targetTimeS)} <span className="muted small">({formatPace(1000 / gap.goalPaceS)})</span></h2>
      {marker ? (
        <p className="essential-pace"><Say tu={`Allure du moment : ${formatPace(1000 / marker.estimate.centerS)}`} /> <span className={`essential-chip ${marker.status}`}>{marker.status === "reachable" ? "à portée" : marker.status === "stretch" ? "ambitieux" : `${marker.gapS} s/km à gagner`}</span></p>
      ) : null}
      <ul className="lever-bars">
        {gap.levers.map((lever) => (
          <li key={lever.key} className={lever.key === gap.main ? "main" : ""}>
            <div className="lever-label"><span>{lever.label}</span><span className="num">{lever.current} <span className="muted">/ {lever.needed}</span>{lever.met ? " ✓" : ""}</span></div>
            <div className="lever-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, lever.share) * 100)} aria-label={lever.label}>
              <span className="lever-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0.04, lever.share)) * 100)}%`, background: LEVER_COLOR[lever.key] ?? "var(--sl-blue)" }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="essential-action"><strong>{allMet ? "Tout est au niveau" : "À faire d'abord"}</strong> <Say tu={gap.action ?? gap.summary} /></p>
      <Link className="essential-link" href="/objectif">Voir l&apos;objectif <ArrowRight size={14} /></Link>
    </section>
  );
}

/** Forme aérobie en une ligne : verdict et allure à la FC de référence. */
export function AerobicLine({ dashboard }: { dashboard: Dashboard }) {
  const { progression } = dashboard;
  const verdict = progressionVerdict(progression);
  return (
    <section className="card essential-aerobic" aria-label={`Forme aérobie : ${verdict.headline}`}>
      <Gauge size={18} aria-hidden />
      <span className="essential-aerobic-label">Forme aérobie</span>
      <span className={`state-badge ${progression.state}`}><VerdictMark state={progression.state} />{verdict.headline}</span>
      {progression.state !== "insufficient" && progression.recent.speedAtReferenceHr ? (
        <span className="essential-aerobic-pace num"><Say tu={`${formatPace(progression.recent.speedAtReferenceHr)} à ${progression.referenceHeartRateBpm} bpm`} /></span>
      ) : null}
    </section>
  );
}
