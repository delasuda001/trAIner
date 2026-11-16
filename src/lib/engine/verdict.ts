import { formatNumber, formatPace } from "@/lib/formatters";
import { SESSION_KIND_LABELS, type ActivityMetrics } from "./activity-metrics";
import type { ComparisonDeltas } from "./comparable";

/**
 * Verdict déterministe d'une séance. C'est lui qui s'affiche quand Claude
 * n'est pas disponible, et c'est lui que Claude reformule : il ne peut ni
 * le changer ni inventer d'autres signaux.
 */

export type VerdictLevel = "above" | "in_line" | "below" | "no_reference";
export type SignalTone = "good" | "neutral" | "watch";

export type Signal = { key: string; tone: SignalTone; weight: number; label: string };

export type SessionVerdict = {
  level: VerdictLevel;
  headline: string;
  signals: Signal[];
  wentWell: string | null;
  toWork: string | null;
};

export const VERDICT_LABELS: Record<VerdictLevel, string> = {
  above: "Au-dessus de tes repères",
  in_line: "Dans tes repères",
  below: "En dessous de tes repères",
  no_reference: "Pas encore de repère",
};

export function buildSignals(metrics: ActivityMetrics, deltas: ComparisonDeltas): Signal[] {
  const signals: Signal[] = [];
  const gain = deltas.paceAtEqualHrGainSPerKm;
  if (gain != null && deltas.count > 0 && metrics.structure === "continuous") {
    const tone: SignalTone = gain >= 5 ? "good" : gain <= -5 ? "watch" : "neutral";
    signals.push({
      key: "efficiency",
      tone,
      weight: 2,
      label: gain === 0
        ? `À FC égale, même allure que tes ${deltas.count} séances comparables.`
        : `À FC égale, ${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"} que tes ${deltas.count} séances comparables.`,
    });
  }

  if (metrics.halves) {
    const drift = metrics.halves.driftPct;
    if (drift != null) {
      const tone: SignalTone = drift <= 3 ? "good" : drift > 5 ? "watch" : "neutral";
      const reference = deltas.drift.reference != null ? ` (comparables : ${formatNumber(deltas.drift.reference, 1)} %)` : "";
      signals.push({ key: "drift", tone, weight: 1, label: `Dérive cardiaque de ${formatNumber(drift, 1)} % entre les deux moitiés${reference}.` });
    }
    const fade = metrics.halves.fadePct;
    const tone: SignalTone = fade <= -1 ? "good" : fade > 3 ? "watch" : "neutral";
    const direction = fade > 0 ? "plus lente" : "plus rapide";
    signals.push({ key: "fade", tone, weight: 1, label: Math.abs(fade) < 0.5 ? "Allure tenue à l'identique sur les deux moitiés." : `Deuxième moitié ${formatNumber(Math.abs(fade), 1)} % ${direction} que la première.` });
  }

  if (metrics.work) {
    const work = metrics.work;
    const progressive = work.fadePct != null && work.fadePct <= -3;
    if (work.speedCvPct != null && !progressive) {
      const tone: SignalTone = work.speedCvPct <= 3 ? "good" : work.speedCvPct > 5 ? "watch" : "neutral";
      signals.push({ key: "rep_consistency", tone, weight: 1, label: `${work.reps} répétitions à ${formatPace(work.averageSpeedMps)} en moyenne, écart entre elles de ${formatNumber(work.speedCvPct, 1)} %.` });
    }
    if (work.fadePct != null) {
      const tone: SignalTone = work.fadePct <= 0 ? "good" : work.fadePct > 3 ? "watch" : "neutral";
      signals.push({ key: "rep_fade", tone, weight: 1, label: work.fadePct <= -3 ? `Répétitions de plus en plus rapides : les dernières ${formatNumber(-work.fadePct, 1)} % plus vite que les premières.` : work.fadePct <= 0 ? "Allure tenue jusqu'à la dernière répétition." : `Dernières répétitions ${formatNumber(work.fadePct, 1)} % plus lentes que les premières.` });
    }
    const reference = deltas.work?.reference;
    if (reference?.speedMps && deltas.count > 0) {
      const deltaPct = (work.averageSpeedMps / reference.speedMps - 1) * 100;
      const tone: SignalTone = deltaPct >= 2 ? "good" : deltaPct <= -2 ? "watch" : "neutral";
      signals.push({ key: "rep_speed", tone, weight: 2, label: `Répétitions à ${formatPace(work.averageSpeedMps)} contre ${formatPace(reference.speedMps)} sur tes ${deltas.count} fractionnés comparables.` });
    }
  }
  return signals;
}

export function classifyVerdict(metrics: ActivityMetrics, deltas: ComparisonDeltas): SessionVerdict {
  const signals = buildSignals(metrics, deltas);
  const score = signals.reduce((sum, signal) => sum + (signal.tone === "good" ? signal.weight : signal.tone === "watch" ? -signal.weight : 0), 0);
  const level: VerdictLevel = deltas.count === 0 ? "no_reference" : score >= 2 ? "above" : score <= -2 ? "below" : "in_line";
  const kindLabel = SESSION_KIND_LABELS[metrics.kind];
  const best = [...signals].filter((signal) => signal.tone === "good").sort((a, b) => b.weight - a.weight)[0];
  const worst = [...signals].filter((signal) => signal.tone === "watch").sort((a, b) => b.weight - a.weight)[0];
  const headline =
    level === "no_reference"
      ? `${kindLabel} : première séance de ce type dans ton historique récent, elle servira de repère.`
      : `${kindLabel} ${level === "above" ? "au-dessus de" : level === "below" ? "en dessous de" : "dans la ligne de"} tes ${deltas.count} séances comparables.`;
  return { level, headline, signals, wentWell: best?.label ?? null, toWork: worst?.label ?? null };
}
