import type { ActivityMetrics, SessionFamily } from "./activity-metrics";
import { mean, median, present, round } from "./stats";

/**
 * Sélection des séances comparables et calcul des écarts. Avec ~1,5 course
 * par semaine, le vivier est petit : critères tolérants, mais même famille
 * de séance obligatoire, et le nombre de séances retenues est toujours exposé.
 */

export type RunForComparison = {
  id: string;
  startTimeUtc: string;
  localDate: string;
  name: string;
  sport: string;
  movingTimeS: number | null;
  distanceM: number | null;
  averageTemperatureC: number | null;
  metrics: ActivityMetrics;
};

export type ComparableMatch = RunForComparison & { score: number };

const MAX_COMPARABLES = 5;
const MAX_SCORE = 2.2;
/** Au-delà d'un an, la forme n'est plus comparable. */
const MAX_AGE_DAYS = 365;
/** En dessous, l'interface et le coach signalent que la comparaison est fragile. */
export const MIN_SOLID_COMPARABLES = 3;

/** Familles voisines acceptées en repli, avec pénalité. */
const NEIGHBOURS: Record<SessionFamily, SessionFamily[]> = {
  easy: ["long"],
  long: ["easy"],
  steady: [],
  intervals: [],
};

function logRatio(a: number | null, b: number | null): number {
  if (!a || !b || a <= 0 || b <= 0) return 0.5;
  return Math.abs(Math.log(a / b));
}

/** Score de dissemblance : 0 = identique. */
export function dissimilarity(current: RunForComparison, candidate: RunForComparison): number | null {
  const currentFamily = current.metrics.family;
  const candidateFamily = candidate.metrics.family;
  let score = 0;
  if (candidateFamily !== currentFamily) {
    if (!NEIGHBOURS[currentFamily].includes(candidateFamily)) return null;
    score += 0.6;
  }
  if (current.metrics.kind !== candidate.metrics.kind) score += 0.25;
  const trail = (sport: string) => sport === "trail_running";
  if (trail(current.sport) !== trail(candidate.sport)) score += 0.6;
  if ((current.sport === "treadmill_running") !== (candidate.sport === "treadmill_running")) score += 0.8;

  score += 1.2 * logRatio(current.movingTimeS, candidate.movingTimeS);
  score += 0.6 * logRatio(current.distanceM, candidate.distanceM);

  const climbA = current.metrics.elevationGainPerKm ?? 0;
  const climbB = candidate.metrics.elevationGainPerKm ?? 0;
  score += Math.min(0.8, Math.abs(climbA - climbB) / 25);


  if (current.metrics.work && candidate.metrics.work) {
    // Même format exigé : comparer l'allure de répétitions de 2 km à celle de 400 m n'a pas de sens.
    const durationRatio = current.metrics.work.averageDurationS / candidate.metrics.work.averageDurationS;
    if (durationRatio < 0.6 || durationRatio > 1.7) return null;
    const recoveryA = current.metrics.work.averageRecoveryS;
    const recoveryB = candidate.metrics.work.averageRecoveryS;
    if (recoveryA && recoveryB && (recoveryA / recoveryB < 0.4 || recoveryA / recoveryB > 2.5)) return null;
    score += 0.8 * logRatio(current.metrics.work.averageDurationS, candidate.metrics.work.averageDurationS);
    score += 0.4 * logRatio(current.metrics.work.reps, candidate.metrics.work.reps);
  }

  // Récence : la forme d'il y a un an n'est plus un repère. Pénalité légère sur 6 mois, forte au-delà.
  const ageDays = (Date.parse(current.startTimeUtc) - Date.parse(candidate.startTimeUtc)) / 86_400_000;
  score += ageDays <= 180 ? (ageDays / 180) * 0.3 : 0.3 + ((ageDays - 180) / 180) * 0.8;
  return round(score, 3);
}

export function selectComparables(current: RunForComparison, history: RunForComparison[]): ComparableMatch[] {
  const currentStart = Date.parse(current.startTimeUtc);
  return history
    .filter((candidate) => candidate.id !== current.id)
    .filter((candidate) => {
      const age = (currentStart - Date.parse(candidate.startTimeUtc)) / 86_400_000;
      return age > 0 && age <= MAX_AGE_DAYS;
    })
    .map((candidate) => ({ ...candidate, score: dissimilarity(current, candidate) }))
    .filter((candidate): candidate is ComparableMatch => candidate.score != null && candidate.score <= MAX_SCORE)
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_COMPARABLES);
}

export type ComparisonDeltas = {
  count: number;
  /** Allure moyenne (hors échauffement) : courant vs moyenne des comparables. */
  current: { speedMps: number | null; heartRateBpm: number | null };
  reference: { speedMps: number | null; heartRateBpm: number | null };
  /** > 0 : plus rapide à FC égale (s/km gagnées). */
  paceAtEqualHrGainSPerKm: number | null;
  /** > 0 : FC plus haute qu'attendu à allure égale (bpm). */
  hrAtEqualPaceDeltaBpm: number | null;
  /** Dérive cardiaque (découplage allure/FC, %) : courant et moyenne comparables. */
  drift: { current: number | null; reference: number | null };
  /** Ralentissement 2e moitié vs 1re (%) : courant et moyenne comparables. */
  fade: { current: number | null; reference: number | null };
  /** Fractionné uniquement. */
  work: {
    current: { speedMps: number; heartRateBpm: number | null; speedCvPct: number | null; fadePct: number | null } | null;
    reference: { speedMps: number | null; heartRateBpm: number | null; speedCvPct: number | null; fadePct: number | null } | null;
    /** > 0 : répétitions plus rapides à FC égale que sur les comparables (s/km). */
    paceAtEqualHrGainSPerKm: number | null;
  } | null;
};

function speedPerBeat(speed: number | null, heartRate: number | null, rest: number): number | null {
  return speed && heartRate && heartRate - rest > 10 ? speed / (heartRate - rest) : null;
}

function secondsPerKm(speed: number): number {
  return 1000 / speed;
}

/**
 * Écarts à FC égale et à allure égale, sur l'allure/FC de la partie principale
 * (5 premières minutes exclues). Modèle : vitesse ∝ (FC − FC repos), valable
 * sur une plage de FC étroite, d'où l'usage de séances comparables uniquement.
 */
export function computeDeltas(current: RunForComparison, comparables: RunForComparison[]): ComparisonDeltas {
  const rest = current.metrics.restingHeartRateUsed;
  const currentSpeed = current.metrics.mainSpeedMps;
  const currentHr = current.metrics.mainHeartRateBpm;
  const refSpeed = mean(present(comparables.map((run) => run.metrics.mainSpeedMps)));
  const refHr = mean(present(comparables.map((run) => run.metrics.mainHeartRateBpm)));
  // Efficacité mesurée de préférence sur les portions stables et plates (fenêtres aérobies) :
  // une accélération ou une côte au milieu d'une sortie ne fausse alors pas la comparaison.
  const useAerobic = current.metrics.aerobic != null && comparables.filter((run) => run.metrics.aerobic).length >= Math.min(2, comparables.length);
  const pick = (run: RunForComparison) => (useAerobic ? (run.metrics.aerobic ? { speed: run.metrics.aerobic.speedMps, hr: run.metrics.aerobic.heartRateBpm } : null) : { speed: run.metrics.mainSpeedMps, hr: run.metrics.mainHeartRateBpm });
  // Médiane : une sortie atypique parmi les comparables ne fait pas basculer l'écart.
  const refRatio = median(present(comparables.map((run) => {
    const sample = pick(run);
    return sample ? speedPerBeat(sample.speed, sample.hr, rest) : null;
  })));
  const currentSample = pick(current);
  const basisSpeed = currentSample?.speed ?? null;
  const basisHr = currentSample?.hr ?? null;
  const currentRatio = speedPerBeat(basisSpeed, basisHr, rest);

  let paceGain: number | null = null;
  let hrDelta: number | null = null;
  // Sur un fractionné, l'allure moyenne mélange travail et récupérations : l'écart « à FC égale » n'a pas de sens.
  if (current.metrics.structure === "continuous" && refRatio && currentRatio && basisHr && basisSpeed) {
    const expectedSpeedAtCurrentHr = refRatio * (basisHr - rest);
    paceGain = round(secondsPerKm(expectedSpeedAtCurrentHr) - secondsPerKm(basisSpeed), 0);
    const expectedHrAtCurrentSpeed = rest + basisSpeed / refRatio;
    hrDelta = round(basisHr - expectedHrAtCurrentSpeed, 0);
  }

  const workRefRatio = median(present(comparables.map((run) => speedPerBeat(run.metrics.work?.averageSpeedMps ?? null, run.metrics.work?.averageHeartRateBpm ?? null, rest))));
  const currentWork = current.metrics.work;
  const workGain = currentWork && workRefRatio && currentWork.averageHeartRateBpm && currentWork.averageHeartRateBpm - rest > 10
    ? round(secondsPerKm(workRefRatio * (currentWork.averageHeartRateBpm - rest)) - secondsPerKm(currentWork.averageSpeedMps), 0)
    : null;
  const work = current.metrics.work
    ? {
        paceAtEqualHrGainSPerKm: comparables.length ? workGain : null,
        current: { speedMps: current.metrics.work.averageSpeedMps, heartRateBpm: current.metrics.work.averageHeartRateBpm, speedCvPct: current.metrics.work.speedCvPct, fadePct: current.metrics.work.fadePct },
        reference: comparables.some((run) => run.metrics.work)
          ? {
              speedMps: mean(present(comparables.map((run) => run.metrics.work?.averageSpeedMps))),
              heartRateBpm: mean(present(comparables.map((run) => run.metrics.work?.averageHeartRateBpm))),
              speedCvPct: mean(present(comparables.map((run) => run.metrics.work?.speedCvPct))),
              fadePct: mean(present(comparables.map((run) => run.metrics.work?.fadePct))),
            }
          : null,
      }
    : null;

  const roundOrNull = (value: number | null, digits: number) => (value == null ? null : round(value, digits));
  return {
    count: comparables.length,
    current: { speedMps: currentSpeed, heartRateBpm: currentHr },
    reference: { speedMps: roundOrNull(refSpeed, 3), heartRateBpm: roundOrNull(refHr, 1) },
    paceAtEqualHrGainSPerKm: comparables.length ? paceGain : null,
    hrAtEqualPaceDeltaBpm: comparables.length ? hrDelta : null,
    drift: { current: current.metrics.halves?.driftPct ?? null, reference: roundOrNull(mean(present(comparables.map((run) => run.metrics.halves?.driftPct))), 1) },
    fade: { current: current.metrics.halves?.fadePct ?? null, reference: roundOrNull(mean(present(comparables.map((run) => run.metrics.halves?.fadePct))), 1) },
    work,
  };
}
