import { formatNumber, formatPace } from "@/lib/formatters";
import { paceSeconds, sessionTitle, type ActivityMetrics } from "./activity-metrics";
import { MIN_SOLID_COMPARABLES, type ComparisonDeltas } from "./comparable";
import { SHORT_REP_S } from "./prescription";

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

/** Seuils (s/km à FC égale) : au-delà, l'écart dépasse le bruit d'une séance à l'autre (jusqu'à 5 s/km : bruit). */
const INTERVAL_GAIN_THRESHOLD_S = 6;
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
      // Écart brut (celui qu'on lit en comparant les allures) puis écart corrigé de la FC.
      const raw = paceSeconds(metrics.work.averageSpeedMps) - paceSeconds(reference.speedMps);
      const rawPart = raw === 0 ? "même allure" : `${formatNumber(Math.abs(raw))} s/km plus ${raw > 0 ? "lentes" : "rapides"}`;
      const hrPart = metrics.work.averageHeartRateBpm && reference.heartRateBpm ? ` (FC ${Math.round(metrics.work.averageHeartRateBpm)} contre ${Math.round(reference.heartRateBpm)} bpm)` : "";
      const correctedPart = Math.abs(gain) < 2 ? "même efficacité une fois corrigé de la FC" : `${raw !== 0 && Math.sign(raw) === Math.sign(-gain) ? "soit" : "mais"} ${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapides" : "lentes"} une fois corrigé de la FC`;
      signals.push({ key: "rep_efficiency", tone, weight: 3, primary: true, label: `Répétitions à ${formatPace(metrics.work.averageSpeedMps)} contre ${formatPace(reference.speedMps)} sur ${comparablesText(deltas.count)} : ${rawPart}, ${correctedPart}${hrPart}.` });
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
    signals.push({ key: "fade", tone, weight: 1, primary: false, label: Math.abs(fade) < 0.5 ? "Allure tenue à l'identique sur les deux moitiés." : `Deuxième moitié ${formatNumber(Math.abs(metrics.halves.fadeSPerKm))} s/km plus ${fade > 0 ? "lente" : "rapide"} que la première.` });
  }

  if (metrics.work) {
    // Une seule lecture du pacing des répétitions (écart et évolution sont le même fait vu deux fois),
    // jugée par rapport à ses propres comparables quand ils existent.
    const work = metrics.work;
    const progressive = work.fadePct != null && work.fadePct <= -3;
    const reference = deltas.count > 0 ? deltas.work?.reference?.paceSpreadSPerKm ?? null : null;
    if (progressive) {
      signals.push({ key: "rep_pacing", tone: "good", weight: 1, primary: false, label: `Répétitions de plus en plus rapides : les dernières ${formatNumber(Math.abs(work.fadeSPerKm ?? 0))} s/km plus vite que les premières.` });
    } else if (work.averageDurationS < SHORT_REP_S && work.fadeSPerKm != null) {
      // Répétitions courtes : l'écart entre deux répétitions est du bruit GPS ; seule la perte en fin de série compte,
      // jugée comme dans les consignes (≥ 10 s/km et 2 points de plus que la perte des comparables du même format).
      const fade = work.fadeSPerKm;
      const referenceFade = deltas.count > 0 ? deltas.work?.reference?.fadePct ?? null : null;
      const worse = fade >= 10 && (referenceFade == null || work.fadePct == null || work.fadePct >= referenceFade + 2);
      const tone: SignalTone = worse ? "watch" : fade <= 3 ? "good" : "neutral";
      const fact = fade > 0 ? `Dernières répétitions ${formatNumber(fade)} s/km plus lentes que les premières` : "Allure tenue jusqu'aux dernières répétitions";
      const reading = worse ? (referenceFade != null ? " : plus de perte que sur tes comparables" : " : perte en fin de série") : " : dans ta norme";
      signals.push({ key: "rep_pacing", tone, weight: 1, primary: false, label: `${fact}${reading}.` });
    } else if (work.paceSpreadSPerKm != null) {
      const spread = work.paceSpreadSPerKm;
      const tone: SignalTone = reference != null
        ? spread <= reference - 3 ? "good" : spread > reference + 5 ? "watch" : "neutral"
        : (work.speedCvPct ?? 0) <= 3 ? "good" : (work.speedCvPct ?? 0) > 5 ? "watch" : "neutral";
      // Comparé à l'écart des comparables : on cite le même indicateur (écart), pas la perte premières → dernières.
      const fact = reference == null && work.fadeSPerKm != null && work.fadeSPerKm > 0 ? `Dernières répétitions ${formatNumber(work.fadeSPerKm)} s/km plus lentes que les premières` : `${formatNumber(spread)} s/km d'écart entre ta répétition la plus rapide et la plus lente`;
      const reading = reference != null
        ? ` (comparables : ${formatNumber(reference)} s/km d'écart) : ${tone === "good" ? "plus régulier que d'habitude" : tone === "watch" ? "plus irrégulier que d'habitude" : "dans ta norme"}`
        : tone === "good" ? " : allure bien tenue" : tone === "watch" ? " : allure mal tenue" : "";
      signals.push({ key: "rep_pacing", tone, weight: 1, primary: false, label: `${fact}${reading}.` });
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
