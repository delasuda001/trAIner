import { formatNumber, formatPace } from "@/lib/formatters";
import { sessionTitle, type ActivityMetrics } from "./activity-metrics";
import { MIN_SOLID_COMPARABLES, type ComparisonDeltas } from "./comparable";

/**
 * Verdict déterministe d'une séance. C'est lui qui s'affiche quand Claude
 * n'est pas disponible, et c'est lui que Claude reformule : il ne peut ni
 * le changer ni inventer d'autres signaux.
 *
 * Le signal principal est l'efficacité à FC égale face aux séances
 * comparables (allure des répétitions pour un fractionné, allure hors
 * échauffement pour un continu). Il fixe le niveau ; les signaux
 * secondaires (régularité, dérive, ralentissement) ne le départagent que
 * s'il est neutre.
 */

export type VerdictLevel = "above" | "in_line" | "below" | "no_reference";
export type SignalTone = "good" | "neutral" | "watch";

export type Signal = { key: string; tone: SignalTone; weight: number; primary: boolean; label: string };

export type SessionVerdict = {
  level: VerdictLevel;
  headline: string;
  signals: Signal[];
  wentWell: string | null;
  toWork: string | null;
  /** Moins de 3 séances comparables : comparaison fragile. */
  fewComparables: boolean;
};

export const VERDICT_LABELS: Record<VerdictLevel, string> = {
  above: "Au-dessus de tes repères",
  in_line: "Dans tes repères",
  below: "En dessous de tes repères",
  no_reference: "Pas encore de repère",
};

/** Seuils (s/km à FC égale) : au-delà, l'écart dépasse le bruit d'une séance à l'autre. */
const INTERVAL_GAIN_THRESHOLD_S = 4;
const CONTINUOUS_GAIN_THRESHOLD_S = 6;

function comparablesText(count: number): string {
  return count === 1 ? "ta seule séance comparable" : `tes ${count} séances comparables`;
}

export function buildSignals(metrics: ActivityMetrics, deltas: ComparisonDeltas): Signal[] {
  const signals: Signal[] = [];

  if (metrics.structure === "continuous" && deltas.paceAtEqualHrGainSPerKm != null && deltas.count > 0) {
    const gain = deltas.paceAtEqualHrGainSPerKm;
    const tone: SignalTone = gain >= CONTINUOUS_GAIN_THRESHOLD_S ? "good" : gain <= -CONTINUOUS_GAIN_THRESHOLD_S ? "watch" : "neutral";
    signals.push({
      key: "efficiency",
      tone,
      weight: 3,
      primary: true,
      label: Math.abs(gain) < 2 ? `À FC égale, même allure que ${comparablesText(deltas.count)}.` : `À FC égale, ${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"} que ${comparablesText(deltas.count)}.`,
    });
  }

  if (metrics.work && deltas.work && deltas.count > 0) {
    const gain = deltas.work.paceAtEqualHrGainSPerKm;
    const reference = deltas.work.reference;
    if (gain != null && reference?.speedMps) {
      const tone: SignalTone = gain >= INTERVAL_GAIN_THRESHOLD_S ? "good" : gain <= -INTERVAL_GAIN_THRESHOLD_S ? "watch" : "neutral";
      const hrPart = metrics.work.averageHeartRateBpm && reference.heartRateBpm ? ` (FC ${Math.round(metrics.work.averageHeartRateBpm)} contre ${Math.round(reference.heartRateBpm)} bpm)` : "";
      const verdictPart = Math.abs(gain) < 2 ? "même efficacité" : `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"} à FC égale`;
      signals.push({ key: "rep_efficiency", tone, weight: 3, primary: true, label: `Répétitions à ${formatPace(metrics.work.averageSpeedMps)} contre ${formatPace(reference.speedMps)}${hrPart} sur ${comparablesText(deltas.count)} : ${verdictPart}.` });
    }
  }

  if (metrics.halves) {
    const drift = metrics.halves.driftPct;
    if (drift != null) {
      const tone: SignalTone = drift <= 3 ? "good" : drift > 5 ? "watch" : "neutral";
      const reference = deltas.drift.reference != null ? ` (comparables : ${formatNumber(deltas.drift.reference, 1)} %)` : "";
      signals.push({ key: "drift", tone, weight: 1, primary: false, label: `Dérive cardiaque de ${formatNumber(drift, 1)} % entre les deux moitiés${reference}.` });
    }
    const fade = metrics.halves.fadePct;
    const tone: SignalTone = fade <= -1 ? "good" : fade > 3 ? "watch" : "neutral";
    signals.push({ key: "fade", tone, weight: 1, primary: false, label: Math.abs(fade) < 0.5 ? "Allure tenue à l'identique sur les deux moitiés." : `Deuxième moitié ${formatNumber(Math.abs(fade), 1)} % plus ${fade > 0 ? "lente" : "rapide"} que la première.` });
  }

  if (metrics.work) {
    const work = metrics.work;
    const progressive = work.fadePct != null && work.fadePct <= -3;
    if (work.speedCvPct != null && !progressive) {
      const tone: SignalTone = work.speedCvPct <= 3 ? "good" : work.speedCvPct > 5 ? "watch" : "neutral";
      signals.push({ key: "rep_consistency", tone, weight: 1, primary: false, label: `Écart d'allure entre répétitions de ${formatNumber(work.speedCvPct, 1)} %.` });
    }
    if (work.fadePct != null) {
      const tone: SignalTone = work.fadePct <= 0 ? "good" : work.fadePct > 3 ? "watch" : "neutral";
      signals.push({ key: "rep_fade", tone, weight: 1, primary: false, label: work.fadePct <= -3 ? `Répétitions de plus en plus rapides : les dernières ${formatNumber(-work.fadePct, 1)} % plus vite que les premières.` : work.fadePct <= 0 ? "Allure tenue jusqu'à la dernière répétition." : `Dernières répétitions ${formatNumber(work.fadePct, 1)} % plus lentes que les premières.` });
    }
  }
  return signals;
}

export function classifyVerdict(metrics: ActivityMetrics, deltas: ComparisonDeltas): SessionVerdict {
  const signals = buildSignals(metrics, deltas);
  const primary = signals.find((signal) => signal.primary);
  const secondaryScore = signals.filter((signal) => !signal.primary).reduce((sum, signal) => sum + (signal.tone === "good" ? 1 : signal.tone === "watch" ? -1 : 0), 0);
  let level: VerdictLevel;
  if (deltas.count === 0) level = "no_reference";
  else if (primary?.tone === "watch") level = "below";
  else if (primary?.tone === "good") level = secondaryScore <= -2 ? "in_line" : "above";
  else level = secondaryScore >= 2 ? "above" : secondaryScore <= -2 ? "below" : "in_line";

  const title = sessionTitle(metrics);
  const best = [...signals].filter((signal) => signal.tone === "good").sort((a, b) => b.weight - a.weight)[0];
  const worst = [...signals].filter((signal) => signal.tone === "watch").sort((a, b) => b.weight - a.weight)[0];
  const headline =
    level === "no_reference"
      ? `${title} : pas de séance comparable récente, elle servira de repère.`
      : primary && primary.tone !== "neutral"
        ? primary.label
        : `${title} ${level === "above" ? "au-dessus de" : level === "below" ? "en dessous de" : "dans la ligne de"} ${comparablesText(deltas.count)}.`;
  return { level, headline, signals, wentWell: best?.label ?? null, toWork: worst?.label ?? null, fewComparables: deltas.count > 0 && deltas.count < MIN_SOLID_COMPARABLES };
}
