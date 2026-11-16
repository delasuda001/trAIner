import { addDays, daysBetween } from "@/lib/dates";
import type { ActivityMetrics } from "./activity-metrics";
import { median, present, round, standardDeviation } from "./stats";

/**
 * Indicateur de progression, 100 % déterministe.
 *
 * Signal principal : efficacité aérobie = allure tenue à une FC de référence,
 * mesurée sur les portions stables, plates, en Z2–Z3 des courses continues.
 * On compare la période récente (6 semaines) à la précédente (6 semaines).
 * Avec ~1,5 course par semaine, chaque période compte peu de courses : on
 * l'expose et on refuse de conclure en dessous de 3 courses par période.
 */

export type ProgressionRun = {
  id: string;
  localDate: string;
  distanceM: number | null;
  metrics: Pick<ActivityMetrics, "aerobic" | "structure" | "restingHeartRateUsed" | "family">;
  sport: string;
};

export type ProgressionState = "progressing" | "stable" | "regressing" | "insufficient";
export type Confidence = "low" | "moderate" | "high";

export type PeriodSummary = {
  start: string;
  end: string;
  runs: number;
  /** Allure à la FC de référence (m/s), moyenne pondérée par les minutes mesurées. */
  speedAtReferenceHr: number | null;
  aerobicMinutes: number;
  runKmPerWeek: number;
};

export type Progression = {
  state: ProgressionState;
  confidence: Confidence | null;
  referenceHeartRateBpm: number;
  windowWeeks: number;
  recent: PeriodSummary;
  previous: PeriodSummary;
  /** > 0 : plus rapide à FC égale (s/km). */
  paceGainSPerKm: number | null;
  changePct: number | null;
  /** Variation typique d'une sortie facile à l'autre (écart-type, s/km) : sert à dire si l'écart sort du bruit. */
  runToRunSpreadSPerKm: number | null;
  vo2max: { latest: number | null; weeksAgo: number | null; delta: number | null };
  /** Points (une course qualifiante = un point) pour la courbe, 16 semaines. */
  points: Array<{ date: string; speedAtReferenceHr: number; minutes: number }>;
  caveats: string[];
};

const MIN_RUNS_PER_PERIOD = 3;
const MIN_AEROBIC_MINUTES = 10;
const STABLE_BAND_PCT = 1.2;

function speedAtReference(run: ProgressionRun, referenceHr: number): number | null {
  const aerobic = run.metrics.aerobic;
  if (!aerobic) return null;
  return aerobic.speedPerBeat * (referenceHr - run.metrics.restingHeartRateUsed);
}

/** Seules les sorties faciles et longues sont comparées entre elles : un tempo ne dit rien de l'allure à FC basse. */
function qualifies(run: ProgressionRun): boolean {
  return run.sport !== "treadmill_running" && run.metrics.structure === "continuous" && (run.metrics.family === "easy" || run.metrics.family === "long") && (run.metrics.aerobic?.minutes ?? 0) >= MIN_AEROBIC_MINUTES;
}

function summarize(runs: ProgressionRun[], allRuns: ProgressionRun[], start: string, end: string, referenceHr: number, weeks: number): PeriodSummary & { values: number[] } {
  const inPeriod = runs.filter((run) => run.localDate >= start && run.localDate <= end);
  const entries = present(inPeriod.map((run) => {
    const value = speedAtReference(run, referenceHr);
    return value == null ? null : { value, weight: run.metrics.aerobic?.minutes ?? 0 };
  }));
  const allInPeriod = allRuns.filter((run) => run.localDate >= start && run.localDate <= end);
  return {
    start,
    end,
    runs: entries.length,
    // Médiane course à course : une sortie atypique (chaleur, fatigue, dénivelé non plat) ne fait pas basculer la tendance.
    speedAtReferenceHr: entries.length ? round(median(entries.map((entry) => entry.value)) as number, 4) : null,
    aerobicMinutes: entries.reduce((sum, entry) => sum + entry.weight, 0),
    runKmPerWeek: round(allInPeriod.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000 / weeks, 1),
    values: entries.map((entry) => entry.value),
  };
}

export function computeProgression(input: {
  runs: ProgressionRun[];
  today: string;
  /** FC de repère par défaut si l'historique ne permet pas d'en déduire une. */
  fallbackReferenceHeartRateBpm: number;
  vo2maxSeries: Array<{ date: string; value: number }>;
}): Progression {
  const { today } = input;
  const qualifying = input.runs.filter(qualifies);
  // FC de repère = FC typique de ses sorties faciles récentes : on extrapole le moins possible.
  const typical = median(present(qualifying.filter((run) => daysBetween(run.localDate, today) < 7 * 16).map((run) => run.metrics.aerobic?.heartRateBpm)));
  const referenceHr = typical != null ? Math.round(typical / 5) * 5 : input.fallbackReferenceHeartRateBpm;

  let windowWeeks = 6;
  let recent = summarize(qualifying, input.runs, addDays(today, -41), today, referenceHr, 6);
  let previous = summarize(qualifying, input.runs, addDays(today, -83), addDays(today, -42), referenceHr, 6);
  if (recent.runs < MIN_RUNS_PER_PERIOD || previous.runs < MIN_RUNS_PER_PERIOD) {
    windowWeeks = 8;
    recent = summarize(qualifying, input.runs, addDays(today, -55), today, referenceHr, 8);
    previous = summarize(qualifying, input.runs, addDays(today, -111), addDays(today, -56), referenceHr, 8);
  }

  const vo2Latest = [...input.vo2maxSeries].filter((entry) => entry.date <= today).at(-1) ?? null;
  const vo2Before = [...input.vo2maxSeries].filter((entry) => entry.date <= addDays(today, -7 * windowWeeks)).at(-1) ?? null;
  const vo2max = {
    latest: vo2Latest?.value ?? null,
    weeksAgo: vo2Before?.value ?? null,
    delta: vo2Latest && vo2Before ? round(vo2Latest.value - vo2Before.value, 1) : null,
  };

  const points = qualifying
    .filter((run) => daysBetween(run.localDate, today) < 7 * 16)
    .map((run) => ({ date: run.localDate, speedAtReferenceHr: round(speedAtReference(run, referenceHr) as number, 4), minutes: run.metrics.aerobic?.minutes ?? 0 }));

  const caveats: string[] = [];
  const strip = (period: PeriodSummary & { values: number[] }): PeriodSummary => ({ start: period.start, end: period.end, runs: period.runs, speedAtReferenceHr: period.speedAtReferenceHr, aerobicMinutes: period.aerobicMinutes, runKmPerWeek: period.runKmPerWeek });

  if (recent.runs < MIN_RUNS_PER_PERIOD || previous.runs < MIN_RUNS_PER_PERIOD || !recent.speedAtReferenceHr || !previous.speedAtReferenceHr) {
    caveats.push(`Il faut au moins ${MIN_RUNS_PER_PERIOD} sorties faciles avec ${MIN_AEROBIC_MINUTES} min stables en Z2–Z3 par période ; il y en a ${recent.runs} sur la période récente et ${previous.runs} sur la précédente.`);
    return { state: "insufficient", confidence: null, referenceHeartRateBpm: referenceHr, windowWeeks, recent: strip(recent), previous: strip(previous), paceGainSPerKm: null, changePct: null, runToRunSpreadSPerKm: null, vo2max, points, caveats };
  }

  const changePct = round((recent.speedAtReferenceHr / previous.speedAtReferenceHr - 1) * 100, 1);
  const paceGain = round(1000 / previous.speedAtReferenceHr - 1000 / recent.speedAtReferenceHr, 0);

  // Erreur standard de la différence, à partir de la dispersion course à course.
  const sdRecent = standardDeviation(recent.values) ?? 0;
  const sdPrevious = standardDeviation(previous.values) ?? 0;
  const standardError = Math.sqrt(sdRecent ** 2 / recent.values.length + sdPrevious ** 2 / previous.values.length);
  const difference = recent.speedAtReferenceHr - previous.speedAtReferenceHr;
  const z = standardError > 0 ? Math.abs(difference) / standardError : 0;
  const minRuns = Math.min(recent.runs, previous.runs);
  const confidence: Confidence = z >= 2.5 && minRuns >= 4 ? "high" : z >= 1.5 ? "moderate" : "low";

  const state: ProgressionState = Math.abs(changePct) < STABLE_BAND_PCT || z < 1 ? "stable" : changePct > 0 ? "progressing" : "regressing";

  if (minRuns < 4) caveats.push(`Peu de courses par période (${recent.runs} et ${previous.runs}) : tendance à confirmer.`);

  return {
    state,
    confidence: state === "stable" ? (z < 1 && minRuns >= 4 ? "moderate" : "low") : confidence,
    referenceHeartRateBpm: referenceHr,
    windowWeeks,
    recent: strip(recent),
    previous: strip(previous),
    paceGainSPerKm: paceGain,
    changePct,
    runToRunSpreadSPerKm: (() => {
      const paces = [...recent.values, ...previous.values].map((speed) => 1000 / speed);
      const spread = standardDeviation(paces);
      return spread == null ? null : round(spread, 0);
    })(),
    vo2max,
    points,
    caveats,
  };
}

/** FC de référence : milieu de la Z2–Z3 (aérobie sous le seuil), arrondi à 5 bpm. */
export function referenceHeartRate(zoneFloors: [number, number, number, number, number]): number {
  return Math.round((zoneFloors[1] + zoneFloors[3]) / 2 / 5) * 5;
}
