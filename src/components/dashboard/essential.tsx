import { ArrowRight, Target } from "lucide-react";
import Link from "next/link";
import { Say } from "@/components/ui/register";
import { primaryGap, type GoalGap } from "@/lib/engine/goal-gap";
import { CoachText } from "@/components/ui/coach-text";
import type { GoalMarker } from "@/lib/engine/prescription";
import { formatClock, formatPace } from "@/lib/formatters";

/**
 * Jauge d'objectif de l'accueil (les deux vues) : ce qui sert à décider, en barres plutôt
 * qu'en texte. Les calculs sont ceux du moteur, rien n'est recalculé ici.
 */

const LEVER_COLOR: Record<string, string> = { frequency: "var(--sl-pink)", volume: "var(--sl-blue)", long_run: "var(--sl-green)", threshold: "var(--sl-orange)" };

/**
 * Jauge d'objectif : un levier par barre, remplie à la part du repère atteinte. Même carte dans
 * les deux vues de l'accueil. L'objectif montré est celui qui décide de la semaine type.
 * Fréquence plafonnée par l'agenda déclaré : un trait marque les sorties possibles.
 */
export function GoalGauge({ gaps, markers }: { gaps: GoalGap[]; markers: GoalMarker[] }) {
  const gap = primaryGap(gaps);
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
  const others = gaps.filter((entry) => entry !== gap);
  return (
    <section className="card essential-goal" aria-labelledby="goal-gauge-title">
      <div className="card-eyebrow"><Target size={13} /> Objectif</div>
      <h2 id="goal-gauge-title" className="essential-goal-title">{gap.race.charAt(0).toUpperCase() + gap.race.slice(1)} en {formatClock(gap.targetTimeS)} <span className="muted small">({formatPace(1000 / gap.goalPaceS)})</span></h2>
      {marker ? (
        <p className="essential-pace"><Say tu={`Allure du moment : ${formatPace(1000 / marker.estimate.centerS)}`} /> <span className={`essential-chip ${marker.status}`}>{marker.status === "reachable" ? "à portée" : marker.status === "stretch" ? "ambitieux" : `${marker.gapS} s/km à gagner`}</span></p>
      ) : null}
      <ul className="lever-bars">
        {gap.levers.map((lever) => {
          const possible = lever.possibleShare ?? null;
          return (
            <li key={lever.key} className={lever.key === gap.main ? "main" : ""}>
              <div className="lever-label"><span>{lever.label}</span><span className="num">{lever.current} <span className="muted">/ {lever.needed}</span>{lever.met ? " ✓" : ""}</span></div>
              <div className="lever-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, lever.share) * 100)} aria-label={lever.label}>
                <span className="lever-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0.04, lever.share)) * 100)}%`, background: LEVER_COLOR[lever.key] ?? "var(--sl-blue)" }} />
                {possible != null ? <span className="lever-cap" style={{ left: `${Math.round(possible * 100)}%` }} title="Sorties possibles selon votre agenda" /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="essential-action"><strong>{allMet ? "Tout est au niveau" : "À faire d'abord"}</strong> <CoachText text={gap.action ?? gap.summary} voice /></p>
      {gap.availabilityNote ? <p className="essential-note small"><Say tu={gap.availabilityNote} /></p> : null}
      <div className="essential-goal-foot">
        <Link className="essential-link" href="/objectif">Voir l&apos;objectif <ArrowRight size={14} /></Link>
        {others.length ? <span className="muted small">Aussi : {others.map((entry) => `${entry.race} en ${formatClock(entry.targetTimeS)}`).join(", ")}</span> : null}
      </div>
    </section>
  );
}
