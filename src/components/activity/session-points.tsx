import { ArrowRight, ThumbsUp, Wrench } from "lucide-react";
import type { SessionCoachOutput } from "@/lib/coach/session-coach";
import type { Prescription, PrescriptionTarget } from "@/lib/engine/prescription";
import { formatClock, formatPace } from "@/lib/formatters";
import { CoachText } from "@/components/ui/coach-text";

/** Cible mise en avant : allure (ou FC) et récupération, calculées par le moteur. */
function targetChip(target: PrescriptionTarget, recoveryS: number | null): string {
  const pace = target.paceFastS != null && target.paceSlowS != null ? `${formatPace(1000 / target.paceFastS).replace("/km", "")}–${formatPace(1000 / target.paceSlowS)}` : null;
  const parts = [pace ?? `${target.heartRateLow}–${target.heartRateHigh} bpm`, pace ? `${target.heartRateLow}–${target.heartRateHigh} bpm` : null, recoveryS ? `récup ${formatClock(recoveryS)}` : null];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Trois points d'une séance : à reproduire, ce qu'il aurait fallu faire, et la
 * consigne pour la prochaine séance du même type. Le texte vient de Claude
 * quand l'analyse existe, sinon directement du moteur ; la cible chiffrée,
 * elle, vient toujours du moteur.
 */
export function SessionPoints({ ready, prescription, fallbackKeep }: { ready: SessionCoachOutput | null; prescription: Prescription; fallbackKeep: string | null }) {
  const ok = prescription.status === "ok" ? prescription : null;
  const keep = ready?.keep || ok?.keep || fallbackKeep;
  // Rien de dégradé selon le moteur : case vide plutôt qu'un reproche artificiel.
  const shouldHave = ok && ok.shouldHave.length === 0 ? null : ready?.shouldHave || ok?.shouldHave[0] || null;
  const nextTime = ready?.nextTime || ok?.next.cue || null;
  if (!keep && !shouldHave && !nextTime) return null;
  return (
    <div className={shouldHave ? "three-points" : "two-points"}>
      {keep ? <div className="point point-good"><div className="point-label"><ThumbsUp size={12} /> À reproduire</div><CoachText text={keep} /></div> : null}
      {shouldHave ? (
        <div className="point point-work">
          <div className="point-label"><Wrench size={12} /> Aurait dû</div>
          {ok ? <div className="point-target">{targetChip(ok.target, null)}</div> : null}
          <CoachText text={shouldHave} />
        </div>
      ) : null}
      {nextTime ? (
        <div className="point point-next">
          <div className="point-label"><ArrowRight size={12} /> Prochaine fois</div>
          {ok ? <div className="point-target">{ok.next.format} · {targetChip(ok.next.target, ok.next.recoveryS)}</div> : null}
          <CoachText text={nextTime} />
        </div>
      ) : null}
    </div>
  );
}
