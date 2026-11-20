import { addDays, daysBetween } from "@/lib/dates";
import type { HeartRateZones } from "@/lib/source/types";
import type { ActivityMetrics } from "./activity-metrics";
import { median, present, round, standardDeviation } from "./stats";
import { EASY_ABOVE_Z2_MARGIN_BPM, MIN_EASY_RUNS_FOR_RECALIBRATION } from "./zones";

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
  /** D'où vient la FC de référence (propre au profil, jamais une valeur fixe). */
  referenceSource: ReferenceHrSource;
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
  /** Seulement quand les données récentes ne suffisent pas à une tendance : estimation tirée de l'historique. */
  estimate?: HistoricalEstimate | null;
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
  /** FC de référence du profil (voir `personalReferenceHeartRate`). */
  reference: ReferenceHeartRate;
  vo2maxSeries: Array<{ date: string; value: number }>;
}): Progression {
  const { today } = input;
  const qualifying = input.runs.filter(qualifies);
  const referenceHr = input.reference.bpm;
  const referenceSource = input.reference.source;

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
    return { state: "insufficient", confidence: null, referenceHeartRateBpm: referenceHr, referenceSource, windowWeeks, recent: strip(recent), previous: strip(previous), paceGainSPerKm: null, changePct: null, runToRunSpreadSPerKm: null, vo2max, points, caveats };
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
    referenceSource,
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

export type ReferenceHrSource = "watch_z2" | "threshold" | "easy_runs" | "zones_z2" | "easy_above_z2";
export type ReferenceHeartRate = { bpm: number; source: ReferenceHrSource };

/** Part de la FC seuil prise comme FC de footing quand la montre ne donne pas ses zones. */
export const EASY_SHARE_OF_THRESHOLD = 0.8;
const MIN_EASY_RUNS_FOR_REFERENCE = 3;
/**
 * FC de référence recalée : ses sorties faciles tournent nettement au-dessus de la Z2 (médiane ≥ haut de Z2
 * + 5 bpm, sur 5 sorties au moins). Mesurer l'allure à une FC qu'il n'atteint jamais en footing la ferait
 * paraître lente. Mesuré : Bastien 135 bpm pour une Z2 jusqu'à 148, Marie 150 pour 149 : non déclenché.
 */
export { EASY_ABOVE_Z2_MARGIN_BPM };

/**
 * FC de référence de l'indicateur, propre à chaque profil :
 * 1. milieu de la zone 2 de la montre (zones Garmin de l'athlète) ;
 * 2. sinon ~80 % de la FC seuil connue ;
 * 3. sinon la FC médiane de ses sorties faciles récentes, ramenée dans sa Z2 ;
 * 4. sinon le milieu de la Z2 de ses zones (déduites ou provisoires).
 */
export function personalReferenceHeartRate(input: { zones: HeartRateZones; zonesFromWatch: boolean; easyRunHeartRates: number[] }): ReferenceHeartRate {
  const { floors, lactateThresholdHeartRateBpm: lthr } = input.zones;
  const z2Low = floors[1];
  const z2High = floors[2] - 1;
  const z2Middle = Math.round((z2Low + z2High) / 2);
  const easyHr = input.easyRunHeartRates.filter((value) => value > 0);
  const easyMedian = easyHr.length >= MIN_EASY_RUNS_FOR_RECALIBRATION ? (median(easyHr) as number) : null;
  if (easyMedian != null && easyMedian >= z2High + EASY_ABOVE_Z2_MARGIN_BPM) {
    // Recalée sur ses footings, sans dépasser le haut de la Z3.
    return { bpm: Math.min(floors[3] - 1, Math.round(easyMedian)), source: "easy_above_z2" };
  }
  if (input.zonesFromWatch) return { bpm: z2Middle, source: "watch_z2" };
  if (lthr != null) return { bpm: Math.round(lthr * EASY_SHARE_OF_THRESHOLD), source: "threshold" };
  const easy = input.easyRunHeartRates.filter((value) => value > 0);
  if (easy.length >= MIN_EASY_RUNS_FOR_REFERENCE) {
    return { bpm: Math.min(z2High, Math.max(z2Low, Math.round(median(easy) as number))), source: "easy_runs" };
  }
  return { bpm: z2Middle, source: "zones_z2" };
}

/** FC des portions aérobies de ses sorties faciles qualifiantes des 16 dernières semaines. */
export function easyRunHeartRates(runs: ProgressionRun[], today: string): number[] {
  return present(runs.filter((run) => qualifies(run) && run.localDate <= today && daysBetween(run.localDate, today) < 7 * 16).map((run) => run.metrics.aerobic?.heartRateBpm));
}

/* ---------- Estimation historique (données récentes insuffisantes) ---------- */

export type HistoryEntry = { date: string; value: number; source: "streams" | "summary" };

export type HistoricalEstimate = {
  /** Allure estimée à la FC de référence (m/s) : la référence historique ajustée par les sorties récentes. */
  speedAtReferenceHr: number;
  /** Référence historique : 25 % meilleures sorties faciles sur 12 mois (m/s). */
  referenceSpeed: number;
  historyRuns: number;
  recentRuns: number;
  confidence: Confidence;
};

const MIN_HISTORY_RUNS = 5;
/** Poids de la référence historique face à chaque sortie récente (une sortie récente pèse 1). */
const HISTORY_PRIOR_WEIGHT = 2;

/**
 * Valeurs par sortie facile sur 12 mois : séries détaillées quand elles existent, sinon résumé
 * (allure et FC moyennes d'une sortie facile d'au moins 20 min dont la FC est en Z2–Z3).
 */
export function historyEntries(runs: Array<ProgressionRun & { movingTimeS: number | null; averageSpeedMps: number | null; averageHeartRateBpm: number | null }>, input: { today: string; referenceHr: number; zones: HeartRateZones; restingHeartRateBpm: number }): HistoryEntry[] {
  const { today, referenceHr, zones, restingHeartRateBpm: rest } = input;
  return present(runs.filter((run) => run.localDate <= today && daysBetween(run.localDate, today) < 365 && run.sport !== "treadmill_running").map((run): HistoryEntry | null => {
    if (qualifies(run)) {
      const value = speedAtReference(run, referenceHr);
      return value ? { date: run.localDate, value, source: "streams" } : null;
    }
    if (run.metrics.aerobic || (run.metrics.family !== "easy" && run.metrics.family !== "long")) return null;
    const hr = run.averageHeartRateBpm;
    const speed = run.averageSpeedMps;
    if (!hr || !speed || hr < zones.floors[1] || hr >= zones.floors[3] || (run.movingTimeS ?? 0) < 20 * 60 || hr <= rest) return null;
    return { date: run.localDate, value: (speed / (hr - rest)) * (referenceHr - rest), source: "summary" };
  }));
}

/**
 * Forme estimée quand la tendance n'est pas calculable : on part de sa référence historique (les 25 %
 * meilleures sorties faciles des 12 derniers mois : pas les 3 meilleures, qui flattent par sélection du
 * bruit) et chaque sortie récente la tire vers ce qu'il court aujourd'hui. Indice de confiance selon le
 * nombre de sorties récentes. Null sans 5 sorties exploitables sur l'année.
 */
export function historicalEstimate(entries: HistoryEntry[], today: string, windowWeeks: number): HistoricalEstimate | null {
  if (entries.length < MIN_HISTORY_RUNS) return null;
  const ascending = entries.map((entry) => entry.value).sort((a, b) => a - b);
  const referenceSpeed = ascending[Math.min(ascending.length - 1, Math.floor(0.75 * ascending.length))];
  const recent = entries.filter((entry) => daysBetween(entry.date, today) < 7 * windowWeeks);
  const speed = (HISTORY_PRIOR_WEIGHT * referenceSpeed + recent.reduce((sum, entry) => sum + entry.value, 0)) / (HISTORY_PRIOR_WEIGHT + recent.length);
  const confidence: Confidence = recent.length >= 4 ? "high" : recent.length >= 1 ? "moderate" : "low";
  return { speedAtReferenceHr: round(speed, 4), referenceSpeed: round(referenceSpeed, 4), historyRuns: entries.length, recentRuns: recent.length, confidence };
}
