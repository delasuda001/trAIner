import "server-only";

import { addDays, localDate } from "@/lib/dates";
import { createActivityRepository } from "@/lib/db/repositories/activity-repository";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { createWellnessRepository } from "@/lib/db/repositories/wellness-repository";
import type { ActivityRow, WellnessRow } from "@/lib/db/types";
import { computeActivityMetrics, METRICS_VERSION, type ActivityMetrics } from "@/lib/engine/activity-metrics";
import { computeDeltas, selectComparables, type ComparisonDeltas, type RunForComparison } from "@/lib/engine/comparable";
import { isRun, summarizeLoad, type LoadSummary } from "@/lib/engine/load";
import { computeProgression, referenceHeartRate, type Progression } from "@/lib/engine/progression";
import { assessRecovery, type RecoverySignals } from "@/lib/engine/recovery";
import { median, present } from "@/lib/engine/stats";
import { suggestNextSession, type Suggestion } from "@/lib/engine/suggestion";
import { classifyVerdict, type SessionVerdict } from "@/lib/engine/verdict";
import { fallbackZones } from "@/lib/engine/zones";
import type { ActivityStreams, HeartRateZones, Lap, WellnessDay } from "@/lib/source/types";
import { athleteProfileSchema, PROFILE_KEY, SYNC_STATE_KEY, syncStateSchema, type SyncState } from "@/lib/sync/sync";

export type Profile = { zones: HeartRateZones; zonesFromWatch: boolean; lactateThresholdSpeedMps: number | null; restingHeartRateBpm: number };

function toWellnessDay(row: WellnessRow): WellnessDay {
  return { date: row.date, hrvLastNightMs: row.hrvLastNightMs, hrvWeeklyAvgMs: row.hrvWeeklyAvgMs, hrvBaselineLowMs: row.hrvBaselineLowMs, hrvBaselineHighMs: row.hrvBaselineHighMs, hrvStatus: row.hrvStatus, sleepDurationS: row.sleepDurationS, sleepScore: row.sleepScore, restingHeartRateBpm: row.restingHeartRateBpm, vo2max: row.vo2max };
}

function parseZones(row: ActivityRow): number[] | null {
  return row.hrTimeInZonesJson ? (JSON.parse(row.hrTimeInZonesJson) as number[]) : null;
}

export function loadProfile(wellness: WellnessDay[], runs: ActivityRow[]): Profile {
  const stored = createAppStateRepository().get(PROFILE_KEY, athleteProfileSchema);
  const observedMax = Math.max(0, ...present(runs.map((run) => run.maxHeartRateBpm)));
  const zones = stored?.heartRateZones ?? fallbackZones(observedMax > 120 ? observedMax : 190);
  // FC de repos stable (médiane sur l'historique de bien-être) : elle sert de constante aux calculs d'efficacité.
  const resting = present(wellness.map((day) => day.restingHeartRateBpm));
  return {
    zones,
    zonesFromWatch: stored?.heartRateZones != null,
    lactateThresholdSpeedMps: stored?.lactateThresholdSpeedMps ?? null,
    restingHeartRateBpm: resting.length >= 7 ? Math.round(median(resting) as number) : 50,
  };
}

export function readSyncState(): SyncState | null {
  return createAppStateRepository().get(SYNC_STATE_KEY, syncStateSchema);
}

/** Calcule (ou relit) les métriques d'une course ; les met en cache en base. */
function metricsFor(row: ActivityRow, profile: Profile, repo: ReturnType<typeof createActivityRepository>): ActivityMetrics | null {
  if (row.metricsJson && row.metricsVersion === METRICS_VERSION) {
    const cached = JSON.parse(row.metricsJson) as ActivityMetrics;
    if (cached.restingHeartRateUsed === profile.restingHeartRateBpm) return cached;
  }
  if (row.detailStatus !== "ready" && row.detailStatus !== "failed") return null;
  const detail = row.detailStatus === "ready" ? repo.getDetail(row.id) : null;
  const metrics = computeActivityMetrics({
    streams: detail?.streams ?? null,
    laps: detail?.laps ?? [],
    zones: profile.zones,
    restingHeartRateBpm: profile.restingHeartRateBpm,
    movingTimeS: row.movingTimeS,
    distanceM: row.distanceM,
    elevationGainM: row.elevationGainM,
    averageSpeedMps: row.averageSpeedMps,
    averageHeartRateBpm: row.averageHeartRateBpm,
    averageCadenceSpm: row.averageCadenceSpm,
    hrTimeInZonesS: parseZones(row),
    trainingEffectLabel: row.trainingEffectLabel,
  });
  repo.saveMetrics(row.id, JSON.stringify(metrics), METRICS_VERSION);
  return metrics;
}

export type AnalyzedRun = RunForComparison & { row: ActivityRow };

type Context = {
  today: string;
  rows: ActivityRow[];
  runs: AnalyzedRun[];
  wellness: WellnessDay[];
  profile: Profile;
};

function loadContext(): Context {
  const today = localDate();
  const repo = createActivityRepository();
  const rows = repo.findAll();
  const wellness = createWellnessRepository().findSince(addDays(today, -400)).map(toWellnessDay);
  const runRows = rows.filter((row) => isRun(row.sport));
  const profile = loadProfile(wellness, runRows);
  const runs: AnalyzedRun[] = [];
  for (const row of runRows) {
    const metrics = metricsFor(row, profile, repo);
    if (!metrics) continue;
    runs.push({ id: row.id, startTimeUtc: row.startTimeUtc, localDate: row.localDate, name: row.name, sport: row.sport, movingTimeS: row.movingTimeS, distanceM: row.distanceM, averageTemperatureC: row.averageTemperatureC, metrics, row });
  }
  return { today, rows, runs, wellness, profile };
}

export type SessionAnalysis = {
  activity: ActivityRow;
  metrics: ActivityMetrics;
  comparables: Array<{ id: string; localDate: string; name: string; movingTimeS: number | null; distanceM: number | null; mainSpeedMps: number | null; mainHeartRateBpm: number | null; workSpeedMps: number | null; workHeartRateBpm: number | null; kind: string; score: number }>;
  deltas: ComparisonDeltas;
  verdict: SessionVerdict;
  profile: Profile;
};

export function analyzeSession(activityId: string, context: Context = loadContext()): SessionAnalysis | null {
  const current = context.runs.find((run) => run.id === activityId);
  if (!current) return null;
  const history = context.runs.filter((run) => run.startTimeUtc < current.startTimeUtc);
  const comparables = selectComparables(current, history);
  const deltas = computeDeltas(current, comparables);
  return {
    activity: current.row,
    metrics: current.metrics,
    comparables: comparables.map((run) => ({ id: run.id, localDate: run.localDate, name: run.name, movingTimeS: run.movingTimeS, distanceM: run.distanceM, mainSpeedMps: run.metrics.mainSpeedMps, mainHeartRateBpm: run.metrics.mainHeartRateBpm, workSpeedMps: run.metrics.work?.averageSpeedMps ?? null, workHeartRateBpm: run.metrics.work?.averageHeartRateBpm ?? null, kind: run.metrics.kind, score: run.score })),
    deltas,
    verdict: classifyVerdict(current.metrics, deltas),
    profile: context.profile,
  };
}

export type ActivityView = {
  activity: ActivityRow;
  analysis: SessionAnalysis | null;
  laps: Lap[];
  /** Séries réduites (~1 point / 10 s) pour les graphiques. */
  chart: Array<{ t: number; d: number | null; pace: number | null; hr: number | null; alt: number | null }>;
  profile: Profile;
};

function downsample(streams: ActivityStreams | null): ActivityView["chart"] {
  if (!streams) return [];
  const step = Math.max(1, Math.round(streams.timeS.length / 400));
  const points: ActivityView["chart"] = [];
  for (let start = 0; start < streams.timeS.length; start += step) {
    const end = Math.min(streams.timeS.length, start + step);
    const slice = (values: Array<number | null>) => present(values.slice(start, end));
    const speeds = slice(streams.speedMps);
    const heartRates = slice(streams.heartRateBpm);
    const altitudes = slice(streams.altitudeM);
    const speed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
    points.push({
      t: streams.timeS[start],
      d: streams.distanceM[start],
      pace: speed && speed > 1 ? Math.round(1000 / speed) : null,
      hr: heartRates.length ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null,
      alt: altitudes.length ? Math.round(altitudes.reduce((a, b) => a + b, 0) / altitudes.length) : null,
    });
  }
  return points;
}

export function getActivityView(activityId: string): ActivityView | null {
  const repo = createActivityRepository();
  const activity = repo.findById(activityId);
  if (!activity) return null;
  const detail = repo.getDetail(activityId);
  const context = loadContext();
  const analysis = isRun(activity.sport) ? analyzeSession(activityId, context) : null;
  return { activity, analysis, laps: detail?.laps ?? [], chart: downsample(detail?.streams ?? null), profile: context.profile };
}

export type Dashboard = {
  today: string;
  profile: Profile;
  load: LoadSummary;
  recovery: RecoverySignals;
  progression: Progression;
  suggestion: Suggestion;
  lastRun: SessionAnalysis | null;
  recent: Array<{ id: string; name: string; sport: string; localDate: string; startTimeLocal: string; distanceM: number | null; movingTimeS: number | null; averageSpeedMps: number | null; averageHeartRateBpm: number | null; kind: string | null }>;
  activityCount: number;
  sync: SyncState | null;
};

export function getDashboard(): Dashboard {
  const context = loadContext();
  const { today, rows, runs, wellness, profile } = context;
  const load = summarizeLoad(rows.map((row) => ({ localDate: row.localDate, sport: row.sport, distanceM: row.distanceM, movingTimeS: row.movingTimeS, trainingLoad: row.trainingLoad, hrTimeInZonesS: parseZones(row) })), today);
  const recovery = assessRecovery(wellness, today);
  const referenceHr = referenceHeartRate(profile.zones.floors);
  const progression = computeProgression({
    runs: runs.map((run) => ({ id: run.id, localDate: run.localDate, distanceM: run.distanceM, averageTemperatureC: run.averageTemperatureC, metrics: run.metrics, sport: run.sport })),
    today,
    fallbackReferenceHeartRateBpm: referenceHr,
    vo2maxSeries: present(wellness.map((day) => (day.vo2max != null ? { date: day.date, value: day.vo2max } : null))),
  });

  const recentRuns = runs.filter((run) => run.localDate >= addDays(today, -42));
  const recentPerBeat = present(recentRuns.map((run) => (run.metrics.aerobic && run.metrics.structure === "continuous" ? run.metrics.aerobic.speedPerBeat : null)));
  const suggestion = suggestNextSession({
    today,
    runs: runs.filter((run) => run.localDate >= addDays(today, -60)).map((run) => ({ localDate: run.localDate, kind: run.metrics.kind, family: run.metrics.family, movingTimeS: run.movingTimeS, aerobicTrainingEffect: run.row.aerobicTrainingEffect })),
    zones: profile.zones,
    restingHeartRateBpm: profile.restingHeartRateBpm,
    recentSpeedPerBeat: recentPerBeat.length ? median(recentPerBeat) : null,
    lactateThresholdSpeedMps: profile.lactateThresholdSpeedMps,
    load,
    recovery,
  });

  const last = runs.at(-1);
  const kindById = new Map(runs.map((run) => [run.id, run.metrics.kind as string]));
  return {
    today,
    profile,
    load,
    recovery,
    progression,
    suggestion,
    lastRun: last ? analyzeSession(last.id, context) : null,
    recent: [...rows].reverse().slice(0, 8).map((row) => ({ id: row.id, name: row.name, sport: row.sport, localDate: row.localDate, startTimeLocal: row.startTimeLocal, distanceM: row.distanceM, movingTimeS: row.movingTimeS, averageSpeedMps: row.averageSpeedMps, averageHeartRateBpm: row.averageHeartRateBpm, kind: kindById.get(row.id) ?? null })),
    activityCount: rows.length,
    sync: readSyncState(),
  };
}
