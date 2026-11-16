import { formatPace } from "@/lib/formatters";
import type { ActivityMetrics, SessionFamily } from "./activity-metrics";
import { paceSeconds } from "./activity-metrics";

/**
 * Ce qui a été fait face à ce qui était conseillé : type de séance, allure et
 * FC par rapport à la cible. Sert au bilan hebdomadaire (jamais au LLM en brut).
 */

export type AdviceTarget = { paceFastS: number | null; paceSlowS: number | null; heartRateLow: number | null; heartRateHigh: number | null };

export type Adherence = {
  /** Même famille de séance que conseillée. */
  typeMatch: boolean;
  pace: string;
  heartRate: string;
  /** Respect global : type, allure (± 3 s/km) et FC (± 3 bpm). */
  followed: boolean;
};

const PACE_MARGIN_S = 3;
const HR_MARGIN_BPM = 3;

/** Allure et FC « de travail » : celles des répétitions pour un fractionné, hors échauffement sinon. */
function effort(metrics: ActivityMetrics): { paceS: number | null; heartRate: number | null } {
  if (metrics.work) return { paceS: paceSeconds(metrics.work.averageSpeedMps), heartRate: metrics.work.averageHeartRateBpm };
  return { paceS: metrics.mainSpeedMps ? paceSeconds(metrics.mainSpeedMps) : null, heartRate: metrics.mainHeartRateBpm };
}

export function compareToAdvice(metrics: ActivityMetrics, expectedFamilies: SessionFamily[], target: AdviceTarget | null): Adherence {
  const typeMatch = expectedFamilies.includes(metrics.family);
  const done = effort(metrics);
  let pace = "pas de cible d'allure";
  let paceOk = true;
  if (target?.paceFastS != null && target.paceSlowS != null && done.paceS != null) {
    const value = formatPace(1000 / done.paceS);
    const range = `${formatPace(1000 / target.paceFastS).replace("/km", "")}–${formatPace(1000 / target.paceSlowS)}`;
    if (done.paceS >= target.paceFastS && done.paceS <= target.paceSlowS) pace = `${value}, dans la cible ${range}`;
    else {
      const faster = done.paceS < target.paceFastS;
      const gap = faster ? target.paceFastS - done.paceS : done.paceS - target.paceSlowS;
      paceOk = gap <= PACE_MARGIN_S;
      pace = `${value}, ${gap} s/km plus ${faster ? "rapide" : "lent"} que la cible ${range}${paceOk ? " (dans la tolérance)" : ""}`;
    }
  }
  let heartRate = "pas de cible de FC";
  let hrOk = true;
  if (target?.heartRateLow != null && target.heartRateHigh != null && done.heartRate != null) {
    const value = Math.round(done.heartRate);
    const range = `${target.heartRateLow}–${target.heartRateHigh} bpm`;
    if (value >= target.heartRateLow && value <= target.heartRateHigh) heartRate = `${value} bpm, dans la cible ${range}`;
    else {
      const above = value > target.heartRateHigh;
      const gap = above ? value - target.heartRateHigh : target.heartRateLow - value;
      hrOk = gap <= HR_MARGIN_BPM;
      heartRate = `${value} bpm, ${gap} bpm ${above ? "au-dessus de" : "sous"} la cible ${range}${hrOk ? " (dans la tolérance)" : ""}`;
    }
  }
  return { typeMatch, pace, heartRate, followed: typeMatch && paceOk && hrOk };
}
