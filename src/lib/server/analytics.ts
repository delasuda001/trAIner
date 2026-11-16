import "server-only";

import { addDays, daysBetween, localDate, startOfIsoWeek } from "@/lib/dates";
import { createActivityRepository } from "@/lib/db/repositories/activity-repository";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { createWellnessRepository } from "@/lib/db/repositories/wellness-repository";
import { createFeelingRepository, type Feeling } from "@/lib/db/repositories/feeling-repository";
import type { ActivityRow, WellnessRow } from "@/lib/db/types";
import { computeActivityMetrics, METRICS_VERSION, sessionTitle, type ActivityMetrics } from "@/lib/engine/activity-metrics";
import { computeDeltas, selectComparables, type ComparisonDeltas, type RunForComparison } from "@/lib/engine/comparable";
import { isRun, summarizeLoad, type LoadSummary } from "@/lib/engine/load";
import { computeProgression, referenceHeartRate, type Progression } from "@/lib/engine/progression";
import { assessRecovery, type RecoverySignals } from "@/lib/engine/recovery";
import { median, present } from "@/lib/engine/stats";
import { goalMarker, prescribe, type GoalMarker, type Prescription, type RecentEffort } from "@/lib/engine/prescription";
import { suggestNextSession, type Suggestion } from "@/lib/engine/suggestion";
import { classifyVerdict, type SessionVerdict } from "@/lib/engine/verdict";
import { fallbackZones } from "@/lib/engine/zones";
import type { ActivityStreams, HeartRateZones, Lap, WellnessDay } from "@/lib/source/types";
import { EMPTY_GOAL, GOAL_KEY, goalSchema, targetPaceMps, type Goal } from "@/lib/goal/goal";
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

export function readGoal(): Goal | null {
  const goal = createAppStateRepository().get(GOAL_KEY, goalSchema);
  return goal && (goal.title || goal.eventDate || goal.preferredDays.length || goal.raceTargets.length || goal.runsPerWeek !== EMPTY_GOAL.runsPerWeek) ? goal : null;
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

export type Context = {
  goal: Goal | null;
  today: string;
  rows: ActivityRow[];
  runs: AnalyzedRun[];
  wellness: WellnessDay[];
  profile: Profile;
};

export function loadContext(): Context {
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
  return { today, rows, runs, wellness, profile, goal: readGoal() };
}

export type SessionAnalysis = {
  activity: ActivityRow;
  metrics: ActivityMetrics;
  comparables: Array<{ id: string; localDate: string; name: string; title: string; ageDays: number; movingTimeS: number | null; distanceM: number | null; mainSpeedMps: number | null; mainHeartRateBpm: number | null; workSpeedMps: number | null; workHeartRateBpm: number | null; kind: string; score: number }>;
  deltas: ComparisonDeltas;
  verdict: SessionVerdict;
  profile: Profile;
  goal: Goal | null;
  /** Ressenti saisi par l'athlète. */
  feeling: Feeling | null;
  /** Contexte du jour de la séance : ce qui peut expliquer un écart. */
  context: SessionContext;
  /** Consignes chiffrées du moteur : comment la mener, et la prochaine fois. */
  prescription: Prescription;
};

export type SessionContext = {
  loadRatio: number | null;
  /** Même ratio sans la séance elle-même (ce que voyait la suggestion avant de courir). */
  loadRatioBefore: number | null;
  acute7dBefore: number;
  acute7d: number;
  chronicWeekly28d: number;
  /** Séances de qualité (fractionné, tempo, seuil) des 14 jours précédents. */
  qualityBefore14d: Array<{ localDate: string; title: string; daysBefore: number }>;
  daysSincePreviousRun: number | null;
  recovery: RecoverySignals;
};

function sessionContext(current: AnalyzedRun, context: Context): SessionContext {
  const date = current.localDate;
  const before = context.rows.filter((row) => row.startTimeUtc < current.startTimeUtc);
  const load = summarizeLoad(before.map((row) => ({ localDate: row.localDate, sport: row.sport, distanceM: row.distanceM, movingTimeS: row.movingTimeS, trainingLoad: row.trainingLoad, hrTimeInZonesS: parseZones(row) })).concat([{ localDate: date, sport: current.sport, distanceM: current.distanceM, movingTimeS: current.movingTimeS, trainingLoad: current.row.trainingLoad, hrTimeInZonesS: parseZones(current.row) }]), date, 4);
  // Charge AVANT la séance (sans elle) : c'est elle qui dit si la séance était bien placée.
  const loadBefore = summarizeLoad(before.map((row) => ({ localDate: row.localDate, sport: row.sport, distanceM: row.distanceM, movingTimeS: row.movingTimeS, trainingLoad: row.trainingLoad, hrTimeInZonesS: parseZones(row) })), date, 4);
  const previousRuns = context.runs.filter((run) => run.startTimeUtc < current.startTimeUtc);
  const quality = previousRuns
    .filter((run) => (run.metrics.family === "intervals" || run.metrics.family === "steady") && daysBetween(run.localDate, date) <= 14)
    .map((run) => ({ localDate: run.localDate, title: sessionTitle(run.metrics), daysBefore: daysBetween(run.localDate, date) }));
  const previous = previousRuns.at(-1);
  return {
    loadRatio: load.ratio,
    loadRatioBefore: loadBefore.ratio,
    acute7dBefore: loadBefore.acute7d,
    acute7d: load.acute7d,
    chronicWeekly28d: load.chronicWeekly28d,
    qualityBefore14d: quality,
    daysSincePreviousRun: previous ? daysBetween(previous.localDate, date) : null,
    recovery: assessRecovery(context.wellness, date),
  };
}

/** Répétitions longues (VO2max) des 12 semaines précédant `date` : base de l'allure 5 km du moment. */
function recentEfforts(runs: AnalyzedRun[], date: string): RecentEffort[] {
  return runs
    .filter((run) => run.localDate < date && run.localDate >= addDays(date, -84) && run.metrics.kind === "intervals_vo2" && run.metrics.work)
    .map((run) => {
      const work = run.metrics.work as NonNullable<ActivityMetrics["work"]>;
      return { localDate: run.localDate, kind: run.metrics.kind, title: sessionTitle(run.metrics), reps: work.reps, repDurationS: work.averageDurationS, workSpeedMps: work.averageSpeedMps };
    });
}

export function analyzeSession(activityId: string, context: Context = loadContext()): SessionAnalysis | null {
  const current = context.runs.find((run) => run.id === activityId);
  if (!current) return null;
  const history = context.runs.filter((run) => run.startTimeUtc < current.startTimeUtc);
  const comparables = selectComparables(current, history);
  const deltas = computeDeltas(current, comparables);
  const sessionCtx = sessionContext(current, context);
  // Efficacité des sorties faciles des 6 semaines précédant la séance : traduit une FC cible en allure.
  const perBeat = present(history.filter((run) => run.localDate >= addDays(current.localDate, -42) && (run.metrics.family === "easy" || run.metrics.family === "long")).map((run) => run.metrics.aerobic?.speedPerBeat ?? null));
  const prescription = prescribe({
    metrics: current.metrics,
    zones: context.profile.zones,
    lactateThresholdSpeedMps: context.profile.lactateThresholdSpeedMps,
    restingHeartRateBpm: context.profile.restingHeartRateBpm,
    recentSpeedPerBeat: perBeat.length ? median(perBeat) : null,
    movingTimeS: current.movingTimeS,
    raceTargets: context.goal?.raceTargets ?? [],
    efforts: recentEfforts(history, current.localDate),
    reference: deltas.count ? { repSpeedMps: deltas.work?.reference?.speedMps ?? null, repHeartRateBpm: deltas.work?.reference?.heartRateBpm ?? null, repSpreadSPerKm: deltas.work?.reference?.paceSpreadSPerKm ?? null, halvesFadeSPerKm: deltas.fadeSPerKm.reference } : null,
    context: { loadRatio: sessionCtx.loadRatioBefore, qualityBefore: sessionCtx.qualityBefore14d },
  });
  return {
    activity: current.row,
    metrics: current.metrics,
    comparables: comparables.map((run) => ({ id: run.id, localDate: run.localDate, name: run.name, title: sessionTitle(run.metrics), ageDays: daysBetween(run.localDate, current.localDate), movingTimeS: run.movingTimeS, distanceM: run.distanceM, mainSpeedMps: run.metrics.mainSpeedMps, mainHeartRateBpm: run.metrics.mainHeartRateBpm, workSpeedMps: run.metrics.work?.averageSpeedMps ?? null, workHeartRateBpm: run.metrics.work?.averageHeartRateBpm ?? null, kind: run.metrics.kind, score: run.score })),
    deltas,
    verdict: classifyVerdict(current.metrics, deltas),
    profile: context.profile,
    goal: context.goal,
    feeling: createFeelingRepository().get(current.id),
    context: sessionCtx,
    prescription,
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
    // Médiane plutôt que moyenne : un pic GPS isolé ne crée pas de faux sprint.
    const speed = speeds.length ? (median(speeds) as number) : null;
    points.push({
      t: streams.timeS[start],
      d: streams.distanceM[start],
      pace: speed && speed > 1 ? Math.round(1000 / speed) : null,
      hr: heartRates.length ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null,
      alt: altitudes.length ? Math.round(altitudes.reduce((a, b) => a + b, 0) / altitudes.length) : null,
    });
  }
  // Lissage léger (médiane glissante sur 3 points, soit ~20 s) pour une courbe lisible.
  return points.map((point, index) => {
    const window = present([points[index - 1]?.pace, point.pace, points[index + 1]?.pace]);
    return { ...point, pace: point.pace == null ? null : Math.round(median(window) as number) };
  });
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
  recent: Array<{ id: string; name: string; sport: string; localDate: string; startTimeLocal: string; distanceM: number | null; movingTimeS: number | null; averageSpeedMps: number | null; averageHeartRateBpm: number | null; kind: string | null; title: string | null; zoneShares: number[] | null }>;
  activityCount: number;
  sync: SyncState | null;
  goal: Goal | null;
  /** Objectifs chiffrés situés par rapport aux repères du moment. */
  goalMarkers: GoalMarker[];
  /** Dernière séance du même type que la prochaine proposée, et sa consigne « prochaine fois ». */
  lastSameType: { id: string; localDate: string; title: string; prescription: Prescription } | null;
  /** Semaine en cours, lundi → dimanche : séances faites et séances proposées. */
  week: Array<{ date: string; done: Array<{ kind: string | null; sport: string }>; planned: string | null }>;
};

/** Types de séance réalisés qui correspondent à une suggestion (pour reprendre la consigne de la dernière fois). */
const SAME_TYPE_KINDS: Partial<Record<Suggestion["primary"]["type"], string[]>> = {
  threshold: ["intervals_threshold", "threshold"],
  vo2max: ["intervals_vo2"],
  specific: ["intervals_threshold", "intervals_tempo", "tempo"],
  endurance: ["endurance", "recovery"],
  recovery_run: ["recovery", "endurance"],
  long: ["long"],
};

type Outlook = { load: LoadSummary; recovery: RecoverySignals; progression: Progression; suggestion: Suggestion };

/** Charge, récupération, progression et suggestion vues depuis `context.today` (les données doivent déjà s'arrêter là). */
function computeOutlook(context: Context): Outlook {
  const { today, rows, runs, wellness, profile } = context;
  const load = summarizeLoad(rows.map((row) => ({ localDate: row.localDate, sport: row.sport, distanceM: row.distanceM, movingTimeS: row.movingTimeS, trainingLoad: row.trainingLoad, hrTimeInZonesS: parseZones(row) })), today);
  const recovery = assessRecovery(wellness, today);
  const referenceHr = referenceHeartRate(profile.zones.floors);
  const progression = computeProgression({
    runs: runs.map((run) => ({ id: run.id, localDate: run.localDate, distanceM: run.distanceM, metrics: run.metrics, sport: run.sport })),
    today,
    fallbackReferenceHeartRateBpm: referenceHr,
    vo2maxSeries: present(wellness.map((day) => (day.vo2max != null ? { date: day.date, value: day.vo2max } : null))),
  });

  const recentRuns = runs.filter((run) => run.localDate >= addDays(today, -42));
  // Efficacité de ses sorties faciles récentes : sert à traduire la FC cible en allure réaliste.
  const recentPerBeat = present(recentRuns.map((run) => (run.metrics.aerobic && (run.metrics.family === "easy" || run.metrics.family === "long") ? run.metrics.aerobic.speedPerBeat : null)));
  const goal = context.goal;
  const suggestion = suggestNextSession({
    today,
    runs: runs.filter((run) => run.localDate >= addDays(today, -60)).map((run) => ({ localDate: run.localDate, kind: run.metrics.kind, family: run.metrics.family, movingTimeS: run.movingTimeS, aerobicTrainingEffect: run.row.aerobicTrainingEffect, title: sessionTitle(run.metrics) })),
    zones: profile.zones,
    restingHeartRateBpm: profile.restingHeartRateBpm,
    recentSpeedPerBeat: recentPerBeat.length ? median(recentPerBeat) : null,
    lactateThresholdSpeedMps: profile.lactateThresholdSpeedMps,
    easyHeartRateBpm: progression.referenceHeartRateBpm,
    load,
    recovery,
    raceTargets: goal?.raceTargets ?? [],
    efforts: recentEfforts(runs, addDays(today, 1)),
    goal: goal ? { eventDate: goal.eventDate, distanceKm: goal.distanceKm, targetPaceMps: targetPaceMps(goal), runsPerWeek: goal.runsPerWeek, preferredDays: goal.preferredDays } : null,
  });
  return { load, recovery, progression, suggestion };
}

/** La suggestion que le moteur affichait juste avant une séance (données arrêtées à son départ). */
export function suggestionBefore(activityId: string, context: Context = loadContext()): { suggestion: Suggestion; run: AnalyzedRun } | null {
  const run = context.runs.find((entry) => entry.id === activityId);
  if (!run) return null;
  const cutoff = run.startTimeUtc;
  const past: Context = {
    ...context,
    today: run.localDate,
    rows: context.rows.filter((row) => row.startTimeUtc < cutoff),
    runs: context.runs.filter((entry) => entry.startTimeUtc < cutoff),
    wellness: context.wellness.filter((day) => day.date <= run.localDate),
  };
  return { suggestion: computeOutlook(past).suggestion, run };
}

export function getDashboard(): Dashboard {
  const context = loadContext();
  const { today, rows, runs, profile } = context;
  const { load, recovery, progression, suggestion } = computeOutlook(context);
  const goal = context.goal;

  const last = runs.at(-1);
  const sameKinds = SAME_TYPE_KINDS[suggestion.primary.type] ?? [];
  const sameRun = [...runs].reverse().find((run) => sameKinds.includes(run.metrics.kind) && run.localDate >= addDays(today, -60));
  const sameAnalysis = sameRun ? analyzeSession(sameRun.id, context) : null;
  const runById = new Map(runs.map((run) => [run.id, run]));
  return {
    today,
    profile,
    load,
    recovery,
    progression,
    suggestion,
    lastRun: last ? analyzeSession(last.id, context) : null,
    goalMarkers: (goal?.raceTargets ?? []).map((target) => goalMarker(goal?.raceTargets ?? [], target.distanceKm, { lactateThresholdSpeedMps: profile.lactateThresholdSpeedMps, efforts: recentEfforts(runs, addDays(today, 1)) })).filter((marker): marker is GoalMarker => marker != null),
    lastSameType: sameRun && sameAnalysis ? { id: sameRun.id, localDate: sameRun.localDate, title: sessionTitle(sameRun.metrics), prescription: sameAnalysis.prescription } : null,
    recent: [...rows].reverse().slice(0, 10).map((row) => ({ id: row.id, name: row.name, sport: row.sport, localDate: row.localDate, startTimeLocal: row.startTimeLocal, distanceM: row.distanceM, movingTimeS: row.movingTimeS, averageSpeedMps: row.averageSpeedMps, averageHeartRateBpm: row.averageHeartRateBpm, kind: runById.get(row.id)?.metrics.kind ?? null, title: runById.get(row.id) ? sessionTitle((runById.get(row.id) as AnalyzedRun).metrics) : null, zoneShares: runById.get(row.id)?.metrics.zoneShares ?? (isRun(row.sport) ? parseZones(row) : null) })),
    activityCount: rows.length,
    sync: readSyncState(),
    goal,
    week: Array.from({ length: 7 }, (_, index) => {
      const date = addDays(startOfIsoWeek(today), index);
      const planned = suggestion.when.date === date ? suggestion.primary.type : suggestion.then?.when.date === date ? suggestion.then.type : null;
      return { date, done: rows.filter((row) => row.localDate === date).map((row) => ({ kind: runById.get(row.id)?.metrics.kind ?? null, sport: row.sport })), planned };
    }),
  };
}

export type RunSummary = { id: string; localDate: string; title: string; distanceM: number | null; movingTimeS: number | null; averageSpeedMps: number | null; averageHeartRateBpm: number | null; verdict: string; headline: string; feeling: Feeling | null };

/** Résumé des dernières courses (un seul chargement du contexte) pour la conversation avec le coach. */
export function recentRunSummaries(limit: number): RunSummary[] {
  const context = loadContext();
  const feelings = new Map(createFeelingRepository().findMany(context.runs.slice(-limit).map((run) => run.id)).map((feeling) => [feeling.activityId, feeling]));
  return context.runs.slice(-limit).reverse().map((run) => {
    const analysis = analyzeSession(run.id, context);
    return {
      id: run.id,
      localDate: run.localDate,
      title: sessionTitle(run.metrics),
      distanceM: run.distanceM,
      movingTimeS: run.movingTimeS,
      averageSpeedMps: run.row.averageSpeedMps,
      averageHeartRateBpm: run.row.averageHeartRateBpm,
      verdict: analysis?.verdict.level ?? "no_reference",
      headline: analysis?.verdict.headline ?? "",
      feeling: feelings.get(run.id) ?? null,
    };
  });
}
