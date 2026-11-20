import "server-only";

import { addDays, daysBetween, localDate, startOfIsoWeek } from "@/lib/dates";
import { createActivityRepository } from "@/lib/db/repositories/activity-repository";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { createWellnessRepository } from "@/lib/db/repositories/wellness-repository";
import { createFeelingRepository, type Feeling } from "@/lib/db/repositories/feeling-repository";
import type { ActivityRow, WellnessRow } from "@/lib/db/types";
import { computeActivityMetrics, METRICS_VERSION, sessionTitle, type ActivityMetrics } from "@/lib/engine/activity-metrics";
import { computeDeltas, selectComparables, type ComparisonDeltas, type RunForComparison } from "@/lib/engine/comparable";
import { isRun, loadAlert, loadFigure, summarizeLoad, type LoadAlert, type LoadFigure, type LoadSummary } from "@/lib/engine/load";
import { calendarZone, trainingCalendar, type TrainingCalendar } from "@/lib/engine/calendar";
import { detectLevel, type LevelAssessment } from "@/lib/engine/athlete-level";
import { goalPages, type GoalPage } from "@/lib/engine/goal-pages";
import { DECLARED_RUNS_KEY, declaredRunsSchema, type DeclaredRun } from "@/lib/declared-runs";
import { computeProgression, easyRunHeartRates, historicalEstimate, historyEntries, personalReferenceHeartRate, type Progression } from "@/lib/engine/progression";
import { assessRecovery, type RecoverySignals } from "@/lib/engine/recovery";
import { runningRhythm, type Rhythm } from "@/lib/engine/rhythm";
import { median, present } from "@/lib/engine/stats";
import { goalMarker, prescribe, type GoalMarker, type Prescription, type RecentEffort } from "@/lib/engine/prescription";
import { suggestNextSession, type Suggestion, type WeekPlan } from "@/lib/engine/suggestion";
import { estimateThreshold, type ThresholdEstimate } from "@/lib/engine/threshold";
import { goalGap, longRunBenchmarkKm, nextLongRunKm, primaryGap, structuralLever, type GoalGap } from "@/lib/engine/goal-gap";
import { classifyVerdict, type SessionVerdict } from "@/lib/engine/verdict";
import { fallbackZones, recalibrateEasyZones, zonesFromHistory, type EasyZonesRecalibration, type ZonesSource } from "@/lib/engine/zones";
import { activeMember } from "@/lib/profiles/context";
import { registerForRole, voiceDeep, type Register } from "@/lib/register";
import type { ActivityStreams, HeartRateZones, Lap, WellnessDay } from "@/lib/source/types";
import { EMPTY_GOAL, GOAL_KEY, goalSchema, targetPaceMps, withInferredTarget, type Goal } from "@/lib/goal/goal";
import { athleteProfileSchema, PROFILE_KEY, SYNC_STATE_KEY, syncStateSchema, type SyncState } from "@/lib/sync/sync";

/** `lactateThresholdSpeedMps` : seuil retenu (observé en séance s'il est nettement plus rapide que la montre, sinon montre) ; détail dans `threshold`. */
export type Profile = {
  zones: HeartRateZones;
  zonesFromWatch: boolean;
  zonesSource: ZonesSource;
  lactateThresholdSpeedMps: number | null;
  restingHeartRateBpm: number;
  threshold?: ThresholdEstimate;
  /** Zones de la montre telles quelles, quand `zones` a été recalé sur ses footings. */
  watchZones?: HeartRateZones;
  /** Recalage de la Z2 sur ses footings (zones sans FC seuil, footings nettement au-dessus de la Z2). */
  easyZones?: EasyZonesRecalibration;
};

function toWellnessDay(row: WellnessRow): WellnessDay {
  return { date: row.date, hrvLastNightMs: row.hrvLastNightMs, hrvWeeklyAvgMs: row.hrvWeeklyAvgMs, hrvBaselineLowMs: row.hrvBaselineLowMs, hrvBaselineHighMs: row.hrvBaselineHighMs, hrvStatus: row.hrvStatus, sleepDurationS: row.sleepDurationS, sleepScore: row.sleepScore, restingHeartRateBpm: row.restingHeartRateBpm, vo2max: row.vo2max };
}

function parseZones(row: ActivityRow): number[] | null {
  return row.hrTimeInZonesJson ? (JSON.parse(row.hrTimeInZonesJson) as number[]) : null;
}

export function loadProfile(wellness: WellnessDay[], runs: ActivityRow[]): Profile {
  const stored = createAppStateRepository().get(PROFILE_KEY, athleteProfileSchema);
  // Zones de la montre d'abord ; sinon déduites des courses du profil ; valeurs provisoires seulement sans aucune FC.
  const fromHistory = stored?.heartRateZones ? null : zonesFromHistory(runs.map((run) => ({ localDate: run.localDate, maxHeartRateBpm: run.maxHeartRateBpm })), localDate());
  const zones = stored?.heartRateZones ?? fromHistory ?? fallbackZones(190);
  const zonesSource: ZonesSource = stored?.heartRateZones ? "watch" : fromHistory ? "history" : "default";
  // FC de repos stable (médiane sur l'historique de bien-être) : elle sert de constante aux calculs d'efficacité.
  const resting = present(wellness.map((day) => day.restingHeartRateBpm));
  const profile: Profile = {
    zones,
    zonesFromWatch: stored?.heartRateZones != null,
    zonesSource,
    lactateThresholdSpeedMps: stored?.lactateThresholdSpeedMps ?? null,
    restingHeartRateBpm: resting.length >= 7 ? Math.round(median(resting) as number) : 50,
  };
  const recalibrated = recalibrateEasyZones(zones, easyRunSummaryHeartRates(runs, localDate()));
  return recalibrated ? { ...profile, zones: recalibrated.zones, watchZones: zones, easyZones: recalibrated.recalibration } : profile;
}

const EASY_WINDOW_DAYS = 112;
const EASY_MIN_MOVING_S = 20 * 60;

/**
 * FC moyenne de ses footings des 16 dernières semaines, lue sur le résumé de la montre
 * (sortie sur route, étiquetée « base aérobie » ou « récupération », 20 min au moins).
 * Le résumé suffit et ne dépend pas des zones : pas de calcul circulaire avec le recalage.
 */
function easyRunSummaryHeartRates(runs: ActivityRow[], today: string): number[] {
  return present(runs
    .filter((run) => run.sport === "running" && (run.trainingEffectLabel === "AEROBIC_BASE" || run.trainingEffectLabel === "RECOVERY") && (run.movingTimeS ?? 0) >= EASY_MIN_MOVING_S && run.localDate <= today && daysBetween(run.localDate, today) < EASY_WINDOW_DAYS)
    .map((run) => run.averageHeartRateBpm));
}

export function readGoal(): Goal | null {
  const goal = createAppStateRepository().get(GOAL_KEY, goalSchema);
  // Objectif chiffré lu dans le titre (« 10 km sous 50 min ») quand rien n'a été saisi à part.
  return goal && (goal.title || goal.eventDate || goal.preferredDays.length || goal.raceTargets.length || goal.runsPerWeek !== EMPTY_GOAL.runsPerWeek) ? withInferredTarget(goal) : null;
}

export function readSyncState(): SyncState | null {
  return createAppStateRepository().get(SYNC_STATE_KEY, syncStateSchema);
}

/** Calcule (ou relit) les métriques d'une course ; les met en cache en base. */
function metricsFor(row: ActivityRow, profile: Profile, repo: ReturnType<typeof createActivityRepository>): ActivityMetrics | null {
  if (row.metricsJson && row.metricsVersion === METRICS_VERSION) {
    const cached = JSON.parse(row.metricsJson) as ActivityMetrics;
    // Zones recalées : les métriques en cache doivent avoir été calculées avec elles (et inversement).
    const sameZones = profile.easyZones ? JSON.stringify(cached.zoneFloorsUsed ?? null) === JSON.stringify(profile.zones.floors) : cached.zoneFloorsUsed == null;
    if (cached.restingHeartRateUsed === profile.restingHeartRateBpm && sameZones) return cached;
  }
  // Séries pas encore chargées (invités : au-delà de 12 semaines, chargées à l'ouverture) : métriques du résumé seul,
  // comme une séance sans détail. Sinon ces courses manquaient à tous les cumuls (km, sorties, rythme). Le passage
  // à « ready » efface ces métriques, recalculées alors avec les séries.
  const detail = row.detailStatus === "ready" ? repo.getDetail(row.id) : null;
  const metrics = computeActivityMetrics({
    streams: detail?.streams ?? null,
    laps: detail?.laps ?? [],
    zones: profile.zones,
    zonesRecalibrated: profile.easyZones != null,
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
  const stored = profile.easyZones ? { ...metrics, zoneFloorsUsed: [...profile.zones.floors] } : metrics;
  repo.saveMetrics(row.id, JSON.stringify(stored), METRICS_VERSION);
  return stored;
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
  // Seuil du moment : la montre, sauf si ses répétitions longues récentes à la FC du seuil disent nettement plus rapide.
  const threshold = estimateThreshold({ runs, today, watchSpeedMps: profile.lactateThresholdSpeedMps, thresholdHeartRateBpm: profile.zones.lactateThresholdHeartRateBpm, zoneFloors: profile.zones.floors });
  const withThreshold: Profile = { ...profile, lactateThresholdSpeedMps: threshold.speedMps, threshold };
  return { today, rows, runs, wellness, profile: withThreshold, goal: readGoal() };
}

export type SessionAnalysis = {
  activity: ActivityRow;
  metrics: ActivityMetrics;
  comparables: Array<{ id: string; localDate: string; name: string; title: string; ageDays: number; movingTimeS: number | null; distanceM: number | null; mainSpeedMps: number | null; mainHeartRateBpm: number | null; workSpeedMps: number | null; workHeartRateBpm: number | null; kind: string; score: number; nature: "format" | "family"; older: boolean }>;
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
  /** Écart à chaque objectif chiffré, vu le jour de la séance (levier principal et action). */
  goalGaps: GoalGap[];
};

export type SessionContext = {
  loadRatio: number | null;
  /** Même ratio sans la séance elle-même (ce que voyait la suggestion avant de courir). */
  loadRatioBefore: number | null;
  /** Hausse de charge avant la séance, corroborée ou non. */
  loadAlertBefore: LoadAlert;
  acute7dBefore: number;
  /** Charge 7 jours AVANT la séance, sa moyenne 4 semaines et leur rapport (une seule référence). */
  loadBefore: LoadFigure;
  acute7d: number;
  chronicWeekly28d: number;
  /** Séances de qualité (fractionné, tempo, seuil) des 14 jours précédents. */
  qualityBefore14d: Array<{ localDate: string; title: string; daysBefore: number }>;
  daysSincePreviousRun: number | null;
  recovery: RecoverySignals;
  /** Rythme habituel du coureur avant la séance (12 semaines) : règles de placement et de charge. */
  rhythm: Rhythm;
};

function sessionContext(current: AnalyzedRun, context: Context): SessionContext {
  const date = current.localDate;
  const before = context.rows.filter((row) => row.startTimeUtc < current.startTimeUtc);
  const load = summarizeLoad(before.map((row) => ({ localDate: row.localDate, sport: row.sport, distanceM: row.distanceM, movingTimeS: row.movingTimeS, trainingLoad: row.trainingLoad, hrTimeInZonesS: parseZones(row) })).concat([{ localDate: date, sport: current.sport, distanceM: current.distanceM, movingTimeS: current.movingTimeS, trainingLoad: current.row.trainingLoad, hrTimeInZonesS: parseZones(current.row) }]), date, 4);
  // Charge AVANT la séance (sans elle) : c'est elle qui dit si la séance était bien placée.
  const loadBefore = summarizeLoad(before.map((row) => ({ localDate: row.localDate, sport: row.sport, distanceM: row.distanceM, movingTimeS: row.movingTimeS, trainingLoad: row.trainingLoad, hrTimeInZonesS: parseZones(row) })), date, 12);
  const recovery = assessRecovery(context.wellness, date);
  // Ressenti noté sur la séance ou sur la précédente : peut corroborer une hausse de charge.
  const previousRun = context.runs.filter((run) => run.startTimeUtc < current.startTimeUtc).at(-1);
  const efforts = present([createFeelingRepository().get(current.id)?.perceivedEffort, previousRun ? createFeelingRepository().get(previousRun.id)?.perceivedEffort : null]);
  const previousRuns = context.runs.filter((run) => run.startTimeUtc < current.startTimeUtc);
  const rhythm = runningRhythm(previousRuns.map((run) => ({ localDate: run.localDate, family: run.metrics.family })), addDays(date, -1));
  const alertBefore = loadAlert(loadBefore, { recoveryFlags: recovery.flags, perceivedEffort: efforts.length ? Math.max(...efforts) : null }, rhythm.highLoadRatio);
  const quality = previousRuns
    .filter((run) => (run.metrics.family === "intervals" || run.metrics.family === "steady") && daysBetween(run.localDate, date) <= 14)
    .map((run) => ({ localDate: run.localDate, title: sessionTitle(run.metrics), daysBefore: daysBetween(run.localDate, date) }));
  const previous = previousRuns.at(-1);
  return {
    loadRatio: load.ratio,
    loadRatioBefore: loadBefore.ratio,
    loadAlertBefore: alertBefore,
    acute7dBefore: loadBefore.acute7d,
    loadBefore: loadFigure(loadBefore),
    acute7d: load.acute7d,
    chronicWeekly28d: load.chronicWeekly28d,
    qualityBefore14d: quality,
    daysSincePreviousRun: previous ? daysBetween(previous.localDate, date) : null,
    recovery,
    rhythm,
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

function thresholdLabel(profile: Profile): string {
  return profile.threshold?.source === "observed" ? "seuil observé" : "seuil montre";
}

/** Écart à chaque objectif chiffré, au jour `today` (courses jusqu'à ce jour inclus). */
function goalGapsFor(goal: Goal | null, runs: AnalyzedRun[], today: string, thresholdSpeedMps: number | null): GoalGap[] {
  if (!goal?.raceTargets.length) return [];
  const history = runs.filter((run) => run.localDate <= today).map((run) => ({ localDate: run.localDate, distanceM: run.distanceM }));
  return goal.raceTargets
    .map((target) => goalGap({ target, runs: history, today, thresholdSpeedMps, eventDate: goal.distanceKm && Math.abs(goal.distanceKm - target.distanceKm) < 0.05 ? goal.eventDate : null, availableRunsPerWeek: goal.runsPerWeek }))
    .filter((gap): gap is GoalGap => gap != null);
}

const LEVER_WORDS: Record<string, string> = { frequency: "la fréquence", volume: "le volume", long_run: "la sortie longue" };

/**
 * Semaine type alignée sur l'écart à l'objectif : seulement si le levier principal est
 * structurel (fréquence, volume, sortie longue). L'objectif le plus long décide (la sortie
 * longue y compte le plus). Les sorties par semaine déclarées fixent la semaine type : jamais plus.
 */
function weekPlanFor(goal: Goal | null, gaps: GoalGap[], runs: AnalyzedRun[], today: string): WeekPlan | null {
  const gap = primaryGap(gaps);
  if (!gap || !structuralLever(gap)) return null;
  const benchmark = longRunBenchmarkKm(gap.distanceKm, gap.goalPaceS);
  if (benchmark == null) return null;
  const long = nextLongRunKm(runs.map((run) => ({ localDate: run.localDate, distanceM: run.distanceM })), today, benchmark);
  // Sorties possibles déclarées = plafond de la semaine type (l'écart à l'objectif ne propose jamais plus).
  return { runsPerWeek: goal?.runsPerWeek ?? gap.nextRunsPerWeek, longRunKm: long.km, longRunStep: long.step, longestKm: long.longestKm, lever: LEVER_WORDS[gap.main as string] ?? "la fréquence", race: gap.race };
}

/** Registre du profil actif : les phrases du moteur sont vouvoyées pour un invité, inchangées pour Bastien. */
function currentRegister(): Register {
  return registerForRole(activeMember()?.role);
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
    thresholdLabel: thresholdLabel(context.profile),
    restingHeartRateBpm: context.profile.restingHeartRateBpm,
    recentSpeedPerBeat: perBeat.length ? median(perBeat) : null,
    movingTimeS: current.movingTimeS,
    raceTargets: context.goal?.raceTargets ?? [],
    efforts: recentEfforts(history, current.localDate),
    reference: deltas.count ? { repSpeedMps: deltas.work?.reference?.speedMps ?? null, repHeartRateBpm: deltas.work?.reference?.heartRateBpm ?? null, repSpreadSPerKm: deltas.work?.reference?.paceSpreadSPerKm ?? null, halvesFadeSPerKm: deltas.fadeSPerKm.reference, repFadePct: deltas.work?.reference?.fadePct ?? null } : null,
    context: { loadAlert: sessionCtx.loadAlertBefore, loadFigure: sessionCtx.loadBefore, qualityBefore: sessionCtx.qualityBefore14d, recoveryFlags: sessionCtx.recovery.flags, verdictLevel: classifyVerdict(current.metrics, deltas).level, qualitySpacingDays: sessionCtx.rhythm.qualitySpacingDays },
  });
  return {
    activity: current.row,
    metrics: current.metrics,
    comparables: comparables.map((run) => ({ id: run.id, localDate: run.localDate, name: run.name, title: sessionTitle(run.metrics), ageDays: daysBetween(run.localDate, current.localDate), movingTimeS: run.movingTimeS, distanceM: run.distanceM, mainSpeedMps: run.metrics.mainSpeedMps, mainHeartRateBpm: run.metrics.mainHeartRateBpm, workSpeedMps: run.metrics.work?.averageSpeedMps ?? null, workHeartRateBpm: run.metrics.work?.averageHeartRateBpm ?? null, kind: run.metrics.kind, score: run.score, nature: run.nature, older: run.older })),
    deltas,
    verdict: voiceDeep(classifyVerdict(current.metrics, deltas), currentRegister()),
    profile: context.profile,
    goal: context.goal,
    feeling: createFeelingRepository().get(current.id),
    context: voiceDeep(sessionCtx, currentRegister()),
    prescription: voiceDeep(prescription, currentRegister()),
    goalGaps: voiceDeep(goalGapsFor(context.goal, context.runs, current.localDate, context.profile.lactateThresholdSpeedMps), currentRegister()),
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
  /** Rythme habituel (12 semaines) : règles adaptées et présentation du coureur au coach. */
  rhythm: Rhythm;
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
  /** Hausse de charge corroborée ou simple repère. */
  loadAlert: LoadAlert;
  /** Objectifs chiffrés situés par rapport aux repères du moment. */
  goalMarkers: GoalMarker[];
  /** Ce qui sépare de chaque objectif chiffré : leviers, levier principal, action. */
  goalGaps: GoalGap[];
  /** Dernière séance du même type que la prochaine proposée, et sa consigne « prochaine fois ». */
  lastSameType: { id: string; localDate: string; title: string; prescription: Prescription } | null;
  /** Semaine en cours, lundi → dimanche : séances faites et séances proposées. */
  week: Array<{ date: string; done: Array<{ kind: string | null; sport: string }>; planned: string | null }>;
  /** Calendrier des 8 dernières semaines (séances, cible de sorties par semaine). */
  calendar: TrainingCalendar;
  /** Niveau déduit des données : règle le ton et les indicateurs de la vue essentielle, jamais le conseil. */
  level: LevelAssessment;
  /** Pages de la carte objectif (chrono, distance, régularité), dans l'ordre du niveau. */
  goalPages: GoalPage[];
  /** Sorties déclarées sans montre (8 dernières semaines) : régularité et calendrier seulement. */
  declaredRuns: DeclaredRun[];
};

const CALENDAR_WEEKS = 8;

/** Zone FC dominante (1 à 5) d'une répartition de temps par zone. */
/** Types de séance réalisés qui correspondent à une suggestion (pour reprendre la consigne de la dernière fois). */
const SAME_TYPE_KINDS: Partial<Record<Suggestion["primary"]["type"], string[]>> = {
  threshold: ["intervals_threshold", "threshold"],
  vo2max: ["intervals_vo2"],
  specific: ["intervals_threshold", "intervals_tempo", "tempo"],
  endurance: ["endurance", "recovery"],
  recovery_run: ["recovery", "endurance"],
  long: ["long"],
};

type Outlook = { load: LoadSummary; loadAlert: LoadAlert; recovery: RecoverySignals; progression: Progression; suggestion: Suggestion; rhythm: Rhythm };

/** Charge, récupération, progression et suggestion vues depuis `context.today` (les données doivent déjà s'arrêter là). */
function computeOutlook(context: Context): Outlook {
  const { today, rows, runs, wellness, profile } = context;
  const load = summarizeLoad(rows.map((row) => ({ localDate: row.localDate, sport: row.sport, distanceM: row.distanceM, movingTimeS: row.movingTimeS, trainingLoad: row.trainingLoad, hrTimeInZonesS: parseZones(row) })), today);
  const recovery = assessRecovery(wellness, today);
  const lastRun = runs.at(-1);
  const lastFeeling = lastRun ? createFeelingRepository().get(lastRun.id) : null;
  const rhythm = runningRhythm(runs.map((run) => ({ localDate: run.localDate, family: run.metrics.family })), today);
  const alert = loadAlert(load, { recoveryFlags: recovery.flags, perceivedEffort: lastFeeling?.perceivedEffort ?? null }, rhythm.highLoadRatio);
  const progressionRuns = runs.map((run) => ({ id: run.id, localDate: run.localDate, distanceM: run.distanceM, metrics: run.metrics, sport: run.sport }));
  const computed = computeProgression({
    runs: progressionRuns,
    today,
    // Zones de la montre : la FC de référence garde sa propre règle de recalage (même seuil de déclenchement).
    reference: personalReferenceHeartRate({ zones: profile.watchZones ?? profile.zones, zonesFromWatch: profile.zonesFromWatch, easyRunHeartRates: easyRunHeartRates(progressionRuns, today) }),
    vo2maxSeries: present(wellness.map((day) => (day.vo2max != null ? { date: day.date, value: day.vo2max } : null))),
  });
  // Tendance impossible (trop peu de sorties faciles récentes) : estimation tirée de l'historique, rien sinon.
  const progression = computed.state === "insufficient"
    ? { ...computed, estimate: historicalEstimate(historyEntries(runs.map((run) => ({ id: run.id, localDate: run.localDate, distanceM: run.distanceM, metrics: run.metrics, sport: run.sport, movingTimeS: run.movingTimeS, averageSpeedMps: run.row.averageSpeedMps, averageHeartRateBpm: run.row.averageHeartRateBpm })), { today, referenceHr: computed.referenceHeartRateBpm, zones: profile.zones, restingHeartRateBpm: profile.restingHeartRateBpm }), today, computed.windowWeeks) }
    : computed;

  const recentRuns = runs.filter((run) => run.localDate >= addDays(today, -42));
  // Efficacité de ses sorties faciles récentes : sert à traduire la FC cible en allure réaliste.
  const recentPerBeat = present(recentRuns.map((run) => (run.metrics.aerobic && (run.metrics.family === "easy" || run.metrics.family === "long") ? run.metrics.aerobic.speedPerBeat : null)));
  const goal = context.goal;
  const beginner = detectLevel(runs.map((run) => ({ localDate: run.localDate, distanceM: run.distanceM, family: run.metrics.family })), today).level === "beginner";
  const suggestion = suggestNextSession({
    beginner,
    today,
    runs: runs.filter((run) => run.localDate >= addDays(today, -60)).map((run) => ({ localDate: run.localDate, kind: run.metrics.kind, family: run.metrics.family, movingTimeS: run.movingTimeS, aerobicTrainingEffect: run.row.aerobicTrainingEffect, title: sessionTitle(run.metrics), distanceM: run.distanceM })),
    zones: profile.zones,
    restingHeartRateBpm: profile.restingHeartRateBpm,
    recentSpeedPerBeat: recentPerBeat.length ? median(recentPerBeat) : null,
    lactateThresholdSpeedMps: profile.lactateThresholdSpeedMps,
    easyHeartRateBpm: progression.referenceHeartRateBpm,
    load,
    loadAlert: alert,
    rhythm,
    recovery,
    weekPlan: weekPlanFor(goal, goalGapsFor(goal, runs, today, profile.lactateThresholdSpeedMps), runs, today),
    raceTargets: goal?.raceTargets ?? [],
    efforts: recentEfforts(runs, addDays(today, 1)),
    goal: goal ? { eventDate: goal.eventDate, distanceKm: goal.distanceKm, targetPaceMps: targetPaceMps(goal), runsPerWeek: goal.runsPerWeek, preferredDays: goal.preferredDays } : null,
  });
  const register = currentRegister();
  return { load, loadAlert: voiceDeep(alert, register), recovery, progression, suggestion: voiceDeep(suggestion, register), rhythm };
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
  const { load, loadAlert: currentLoadAlert, recovery, progression, suggestion, rhythm } = computeOutlook(context);
  const goal = context.goal;

  const last = runs.at(-1);
  const sameKinds = SAME_TYPE_KINDS[suggestion.primary.type] ?? [];
  const sameRun = [...runs].reverse().find((run) => sameKinds.includes(run.metrics.kind) && run.localDate >= addDays(today, -60));
  const sameAnalysis = sameRun ? analyzeSession(sameRun.id, context) : null;
  const runById = new Map(runs.map((run) => [run.id, run]));
  const declared = createAppStateRepository().get(DECLARED_RUNS_KEY, declaredRunsSchema) ?? [];
  const calendarStart = addDays(startOfIsoWeek(today), -7 * (CALENDAR_WEEKS - 1));
  const level = voiceDeep(detectLevel(runs.map((run) => ({ localDate: run.localDate, distanceM: run.distanceM, family: run.metrics.family })), today), currentRegister());
  const goalGaps = voiceDeep(goalGapsFor(goal, runs, today, profile.lactateThresholdSpeedMps), currentRegister());
  const goalMarkers = (goal?.raceTargets ?? []).map((target) => goalMarker(goal?.raceTargets ?? [], target.distanceKm, { lactateThresholdSpeedMps: profile.lactateThresholdSpeedMps, thresholdLabel: thresholdLabel(profile), efforts: recentEfforts(runs, addDays(today, 1)) })).filter((marker): marker is GoalMarker => marker != null);
  return {
    level,
    goalPages: voiceDeep(goalPages({ level: level.level, gaps: goalGaps, markers: goalMarkers, runs: [...runs.map((run) => ({ localDate: run.localDate, distanceM: run.distanceM })), ...declared.map((run) => ({ localDate: run.date, distanceM: null }))].sort((a, b) => a.localDate.localeCompare(b.localDate)), today, goal: goal ? { distanceKm: goal.distanceKm, targetTimeS: goal.targetTimeS, runsPerWeek: goal.runsPerWeek } : null, habitualRunsPerWeek: rhythm.runsPerWeek12w }), currentRegister()),
    declaredRuns: declared.filter((run) => run.date >= calendarStart),
    rhythm,
    today,
    profile,
    load,
    recovery,
    progression,
    suggestion,
    lastRun: last ? analyzeSession(last.id, context) : null,
    loadAlert: currentLoadAlert,
    goalMarkers,
    goalGaps,
    lastSameType: sameRun && sameAnalysis ? { id: sameRun.id, localDate: sameRun.localDate, title: sessionTitle(sameRun.metrics), prescription: sameAnalysis.prescription } : null,
    recent: [...rows].reverse().slice(0, 10).map((row) => ({ id: row.id, name: row.name, sport: row.sport, localDate: row.localDate, startTimeLocal: row.startTimeLocal, distanceM: row.distanceM, movingTimeS: row.movingTimeS, averageSpeedMps: row.averageSpeedMps, averageHeartRateBpm: row.averageHeartRateBpm, kind: runById.get(row.id)?.metrics.kind ?? null, title: runById.get(row.id) ? sessionTitle((runById.get(row.id) as AnalyzedRun).metrics) : null, zoneShares: runById.get(row.id)?.metrics.zoneShares ?? (isRun(row.sport) ? parseZones(row) : null) })),
    activityCount: rows.length,
    sync: readSyncState(),
    goal,
    calendar: trainingCalendar({
      today,
      weeks: CALENDAR_WEEKS,
      target: weekPlanFor(goal, goalGapsFor(goal, runs, today, profile.lactateThresholdSpeedMps), runs, today)?.runsPerWeek ?? goal?.runsPerWeek ?? null,
      activities: rows.filter((row) => row.localDate >= addDays(startOfIsoWeek(today), -7 * (CALENDAR_WEEKS - 1))).map((row) => {
        const run = runById.get(row.id);
        return { id: row.id, date: row.localDate, run: isRun(row.sport), zone: calendarZone(run?.metrics.kind ?? null, run?.metrics.zoneShares ?? (isRun(row.sport) ? parseZones(row) : null)), family: run?.metrics.family ?? "other", title: run ? sessionTitle(run.metrics) : row.name, distanceM: row.distanceM };
      }).concat(declared.filter((run) => run.date >= calendarStart).map((run) => ({ id: `declaree-${run.id}`, date: run.date, run: true, zone: null, family: "declared", title: `Sortie sans montre (${run.durationMin} min)`, distanceM: null, declared: true }))),
      planned: [
        ...suggestion.when.dates.map((date, index) => ({ date, type: suggestion.primary.type, alternative: index > 0 })),
        ...(suggestion.then ? [{ date: suggestion.then.when.date, type: suggestion.then.type, alternative: false }] : []),
      ].filter((entry) => entry.type !== "rest"),
    }),
    week: Array.from({ length: 7 }, (_, index) => {
      const date = addDays(startOfIsoWeek(today), index);
      const planned = suggestion.when.dates.includes(date) ? suggestion.primary.type : suggestion.then?.when.date === date ? suggestion.then.type : null;
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
