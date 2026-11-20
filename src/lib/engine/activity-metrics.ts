import type { ActivityStreams, HeartRateZones, Lap } from "@/lib/source/types";
import { mean, median, present, round, standardDeviation } from "./stats";
import { zoneOf, type ZoneIndex } from "./zones";

/**
 * Métriques dérivées d'une course, calculées une fois à partir des séries
 * (FIT, ~1 Hz) et des laps, puis mises en cache en base. Tout ce que le
 * coach affirme sur une séance vient d'ici ou des comparaisons qui en
 * découlent : le LLM ne calcule rien.
 */

export const METRICS_VERSION = 13;

export type SessionKind =
  | "recovery"
  | "endurance"
  | "long"
  | "tempo"
  | "threshold"
  | "intervals_short"
  | "intervals_vo2"
  | "intervals_threshold"
  | "intervals_tempo";

export type SessionFamily = "easy" | "long" | "steady" | "intervals";

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  recovery: "Footing de récupération",
  endurance: "Endurance",
  long: "Sortie longue",
  tempo: "Allure soutenue",
  threshold: "Continu au seuil",
  intervals_short: "Fractionné court",
  intervals_vo2: "Fractionné VO2max",
  intervals_threshold: "Fractionné au seuil",
  intervals_tempo: "Fractionné tempo",
};

/** Sous-titre d'intensité d'un fractionné (le titre, lui, décrit la structure). */
export const INTERVAL_INTENSITY_LABELS: Partial<Record<SessionKind, string>> = {
  intervals_short: "vitesse",
  intervals_vo2: "intensité VO2max",
  intervals_threshold: "intensité seuil",
  intervals_tempo: "intensité tempo",
};

function formatRepDistance(meters: number): string {
  if (meters >= 1000) {
    const km = Math.round(meters / 100) / 10;
    return `${String(km).replace(".", ",")} km`;
  }
  return `${Math.round(meters / 50) * 50} m`;
}

function formatRepDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds / 5) * 5} s`;
  const minutes = Math.round(seconds / 30) / 2;
  return `${String(minutes).replace(".", ",")} min`;
}

/**
 * Intitulé d'une séance décrit par sa structure : « Fractionné long 3 × 2 km »,
 * « Fractionné court 10 × 45 s ». Les séances continues gardent leur type.
 */
export function sessionTitle(metrics: Pick<ActivityMetrics, "kind" | "work">): string {
  const work = metrics.work;
  if (!work) return SESSION_KIND_LABELS[metrics.kind];
  const adjective = work.averageDurationS < 75 ? " court" : work.averageDurationS >= 300 ? " long" : "";
  const distances = work.repsDetail.map((rep) => rep.distanceM ?? 0);
  const meanDistance = distances.reduce((sum, value) => sum + value, 0) / Math.max(1, distances.length);
  const spread = Math.max(...distances) - Math.min(...distances);
  const byDistance = meanDistance >= 300 && distances.every((value) => value > 0) && spread / meanDistance < 0.08;
  const format = byDistance ? formatRepDistance(meanDistance) : formatRepDuration(work.averageDurationS);
  return `Fractionné${adjective} ${work.reps} × ${format}`;
}

/** Endurance : au-delà de cette part du temps au-dessus de la Z2 (Z3 et plus), la séance n'est plus facile. */
export const EASY_ABOVE_Z2_LIMIT = 0.25;

/** Part du temps au-dessus de la Z2 d'une sortie facile ou longue, si elle dépasse la limite ; null sinon. */
export function easyAboveZ2Share(metrics: Pick<ActivityMetrics, "family" | "zoneShares">): number | null {
  if ((metrics.family !== "easy" && metrics.family !== "long") || !metrics.zoneShares) return null;
  const share = metrics.zoneShares[2] + metrics.zoneShares[3] + metrics.zoneShares[4];
  return share >= EASY_ABOVE_Z2_LIMIT ? share : null;
}

export function familyOf(kind: SessionKind): SessionFamily {
  if (kind === "recovery" || kind === "endurance") return "easy";
  if (kind === "long") return "long";
  if (kind === "tempo" || kind === "threshold") return "steady";
  return "intervals";
}

/** Allure en secondes/km arrondie comme à l'affichage : les écarts se retrouvent dans les tableaux. */
export function paceSeconds(speedMps: number): number {
  return Math.round(1000 / speedMps);
}

export type HalfSplit = { speedMps: number; heartRateBpm: number | null };

export type WorkBlock = {
  reps: number;
  averageDurationS: number;
  averageDistanceM: number | null;
  averageSpeedMps: number;
  averageHeartRateBpm: number | null;
  /** Moyenne des FC max atteintes sur chaque répétition. */
  peakHeartRateBpm: number | null;
  /** Dispersion des allures entre répétitions (%). */
  speedCvPct: number | null;
  /** > 0 : les dernières répétitions sont plus lentes que les premières (%). */
  fadePct: number | null;
  /** Écart entre la répétition la plus rapide et la plus lente (s/km). */
  paceSpreadSPerKm: number | null;
  /** > 0 : dernières répétitions plus lentes que les premières (s/km). */
  fadeSPerKm: number | null;
  averageRecoveryS: number | null;
  /** Une ligne par répétition (et la récupération qui suit). */
  repsDetail: Array<{ startOffsetS: number; durationS: number; distanceM: number | null; speedMps: number; heartRateBpm: number | null; maxHeartRateBpm: number | null; recoveryAfterS: number | null }>;
};

export type AerobicSample = {
  /** Minutes de fenêtres stables, plates, en Z2–Z3. */
  minutes: number;
  speedMps: number;
  heartRateBpm: number;
  /** Vitesse par battement au-dessus du repos (m/s/bpm) : indicateur d'efficacité aérobie. */
  speedPerBeat: number;
};

export type ActivityMetrics = {
  version: number;
  restingHeartRateUsed: number;
  /** Planchers des zones utilisées, seulement quand la Z2 a été recalée sur ses footings (sert au cache). */
  zoneFloorsUsed?: number[];
  kind: SessionKind;
  family: SessionFamily;
  structure: "continuous" | "intervals";
  /** Allure et FC moyennes hors 5 premières minutes. */
  mainSpeedMps: number | null;
  mainHeartRateBpm: number | null;
  halves: { first: HalfSplit; second: HalfSplit; fadePct: number; driftPct: number | null; /** > 0 : 2e moitié plus lente (s/km). */ fadeSPerKm: number } | null;
  work: WorkBlock | null;
  aerobic: AerobicSample | null;
  /** Part du temps (0-1) dans chaque zone FC, Z1 à Z5 (sous Z1 compté en Z1). */
  zoneShares: [number, number, number, number, number] | null;
  elevationGainPerKm: number | null;
  averageCadenceSpm: number | null;
  /** Blocs de 5 km (sorties de 12 km et plus) : allure et FC par bloc. */
  blocks: Array<{ fromKm: number; toKm: number; speedMps: number; heartRateBpm: number | null }> | null;
  /** Dynamique de course, si la montre la mesure. */
  dynamics: RunningDynamics | null;
};

export type DynamicsValues = {
  cadenceSpm: number | null;
  groundContactMs: number | null;
  verticalOscillationMm: number | null;
  verticalRatioPct: number | null;
  stepLengthM: number | null;
};

export type RunningDynamics = DynamicsValues & {
  /** Sur quoi portent les moyennes : toute la séance courue, ou les répétitions seulement. */
  basis: "running" | "reps";
  /** Début puis fin de l'effort (1re/2e moitié, ou 1re/dernière répétition) : la dérive de foulée signale la fatigue. */
  early: DynamicsValues;
  late: DynamicsValues;
};

export type MetricsInput = {
  streams: ActivityStreams | null;
  laps: Lap[];
  zones: HeartRateZones;
  /** Z2 recalée sur ses footings : la FC doit confirmer l'étiquette de la montre. */
  zonesRecalibrated?: boolean;
  restingHeartRateBpm: number;
  movingTimeS: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  averageSpeedMps: number | null;
  averageHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  hrTimeInZonesS: number[] | null;
  /** Bénéfice principal estimé par la montre (AEROBIC_BASE, TEMPO…), utilisé pour départager. */
  trainingEffectLabel: string | null;
};

const WARMUP_SKIP_S = 300;
const AEROBIC_SKIP_S = 480;
const WINDOW_S = 60;
const MIN_RUNNING_SPEED = 1.8;

type Window = { startS: number; speed: number; cv: number; heartRate: number | null; grade: number | null };

function buildWindows(streams: ActivityStreams): Window[] {
  const buckets = new Map<number, number[]>();
  streams.timeS.forEach((time, index) => {
    const key = Math.floor(time / WINDOW_S);
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });
  const windows: Window[] = [];
  for (const [key, indexes] of buckets) {
    const speeds = present(indexes.map((index) => streams.speedMps[index]));
    // Couverture exigée en temps et non en nombre d'échantillons : les montres en
    // « enregistrement intelligent » n'écrivent qu'un point toutes les quelques secondes.
    const span = streams.timeS[indexes[indexes.length - 1]] - streams.timeS[indexes[0]];
    if (speeds.length < 6 || span < WINDOW_S * 0.7) continue;
    const average = mean(speeds) ?? 0;
    const deviation = standardDeviation(speeds) ?? 0;
    const heartRates = present(indexes.map((index) => streams.heartRateBpm[index]));
    const first = indexes[0];
    const last = indexes[indexes.length - 1];
    const startAltitude = streams.altitudeM[first];
    const endAltitude = streams.altitudeM[last];
    const startDistance = streams.distanceM[first];
    const endDistance = streams.distanceM[last];
    const distance = startDistance != null && endDistance != null ? endDistance - startDistance : null;
    const grade = startAltitude != null && endAltitude != null && distance != null && distance > 50 ? (endAltitude - startAltitude) / distance : null;
    windows.push({ startS: key * WINDOW_S, speed: average, cv: average > 0 ? deviation / average : 1, heartRate: heartRates.length >= speeds.length * 0.8 ? (mean(heartRates) ?? null) : null, grade });
  }
  return windows.sort((a, b) => a.startS - b.startS);
}

function computeAerobic(windows: Window[], zones: HeartRateZones, rest: number): AerobicSample | null {
  const low = zones.floors[1];
  const high = zones.floors[3];
  const qualifying = windows.filter((window) => window.startS >= AEROBIC_SKIP_S && window.speed >= MIN_RUNNING_SPEED && window.cv < 0.1 && window.grade != null && Math.abs(window.grade) < 0.03 && window.heartRate != null && window.heartRate >= low && window.heartRate < high);
  if (qualifying.length < 5) return null;
  const speedPerBeat = median(qualifying.map((window) => window.speed / ((window.heartRate as number) - rest))) as number;
  return {
    minutes: qualifying.length,
    speedMps: round(median(qualifying.map((window) => window.speed)) as number, 3),
    heartRateBpm: round(median(qualifying.map((window) => window.heartRate as number)) as number, 1),
    speedPerBeat: round(speedPerBeat, 5),
  };
}

function segmentAverage(streams: ActivityStreams, fromS: number, toS: number): HalfSplit | null {
  let firstIndex = -1;
  let lastIndex = -1;
  const heartRates: number[] = [];
  streams.timeS.forEach((time, index) => {
    if (time < fromS || time > toS) return;
    if (firstIndex < 0) firstIndex = index;
    lastIndex = index;
    const heartRate = streams.heartRateBpm[index];
    if (heartRate != null) heartRates.push(heartRate);
  });
  if (firstIndex < 0 || lastIndex <= firstIndex) return null;
  const startDistance = streams.distanceM[firstIndex];
  const endDistance = streams.distanceM[lastIndex];
  const elapsed = streams.timeS[lastIndex] - streams.timeS[firstIndex];
  if (startDistance == null || endDistance == null || elapsed <= 0) return null;
  const speed = (endDistance - startDistance) / elapsed;
  return { speedMps: round(speed, 3), heartRateBpm: heartRates.length ? round(mean(heartRates) as number, 1) : null };
}

function computeHalves(streams: ActivityStreams): ActivityMetrics["halves"] {
  const end = streams.timeS[streams.timeS.length - 1] ?? 0;
  if (end < WARMUP_SKIP_S + 600) return null;
  const middle = WARMUP_SKIP_S + (end - WARMUP_SKIP_S) / 2;
  const first = segmentAverage(streams, WARMUP_SKIP_S, middle);
  const second = segmentAverage(streams, middle, end);
  if (!first || !second || first.speedMps <= 0 || second.speedMps <= 0) return null;
  const fadePct = round((first.speedMps / second.speedMps - 1) * 100, 1);
  const driftPct = first.heartRateBpm && second.heartRateBpm ? round(((first.speedMps / first.heartRateBpm - second.speedMps / second.heartRateBpm) / (first.speedMps / first.heartRateBpm)) * 100, 1) : null;
  return { first, second, fadePct, driftPct, fadeSPerKm: paceSeconds(second.speedMps) - paceSeconds(first.speedMps) };
}

/**
 * Sépare les laps rapides (répétitions) des autres : est « rapide » un lap à
 * moins de 12 % de la vitesse typique des 3 laps les plus rapides. Robuste à
 * un échauffement un peu appuyé, qu'un découpage en deux groupes classerait à tort.
 */
function splitLapsBySpeed(laps: Lap[]): { fast: Lap[]; slow: Lap[]; ratio: number } | null {
  const usable = laps.filter((lap) => lap.averageSpeedMps != null && lap.averageSpeedMps > 0.5 && lap.durationS >= 20);
  if (usable.length < 5) return null;
  const speeds = usable.map((lap) => lap.averageSpeedMps as number).sort((a, b) => b - a);
  const top = median(speeds.slice(0, 3)) as number;
  const cut = top * 0.88;
  const fast = usable.filter((lap) => (lap.averageSpeedMps as number) >= cut);
  const slow = usable.filter((lap) => (lap.averageSpeedMps as number) < cut);
  if (!fast.length || !slow.length) return null;
  const ratio = (median(fast.map((lap) => lap.averageSpeedMps as number)) as number) / (median(slow.map((lap) => lap.averageSpeedMps as number)) as number);
  return { fast, slow, ratio };
}

/** En dessous, les portions rapides sont des accélérations dans un footing, pas une séance fractionnée. */
const MIN_WORK_SHARE = 0.2;
const MIN_WORK_TOTAL_S = 8 * 60;
/**
 * Fractionné court et dense (14 × 30/30, 10 × 200 m…) : moins de 8 min de travail au total,
 * mais une vraie séance. Reconnu à partir de 6 répétitions et 4 min de travail si le bloc
 * (de la 1re à la dernière répétition) est dense : au moins 40 % de travail, quand des
 * accélérations dans un footing restent autour de 15 à 25 %.
 */
const DENSE_MIN_REPS = 6;
const DENSE_MIN_WORK_S = 4 * 60;
const DENSE_MIN_BLOCK_SHARE = 0.4;

export function detectWorkBlock(laps: Lap[]): WorkBlock | null {
  const split = splitLapsBySpeed(laps);
  if (!split || split.ratio < 1.15 || split.fast.length < 3) return null;
  const totalS = laps.reduce((sum, lap) => sum + lap.durationS, 0);
  const workS = split.fast.reduce((sum, lap) => sum + lap.durationS, 0);
  // Durée du bloc de la 1re à la dernière répétition (laps dans l'ordre, récupérations comprises).
  const inOrder = [...laps].sort((a, b) => a.index - b.index);
  const fastSet = new Set(split.fast.map((lap) => lap.index));
  const firstFast = inOrder.findIndex((lap) => fastSet.has(lap.index));
  const lastFast = inOrder.length - 1 - [...inOrder].reverse().findIndex((lap) => fastSet.has(lap.index));
  const blockS = inOrder.slice(firstFast, lastFast + 1).reduce((sum, lap) => sum + lap.durationS, 0);
  const dense = split.fast.length >= DENSE_MIN_REPS && workS >= DENSE_MIN_WORK_S && blockS > 0 && workS / blockS >= DENSE_MIN_BLOCK_SHARE;
  if ((workS < MIN_WORK_TOTAL_S && !dense) || (totalS > 0 && workS / totalS < MIN_WORK_SHARE && !dense)) return null;
  const fastIndexes = new Set(split.fast.map((lap) => lap.index));
  // Une vraie séance fractionnée alterne travail et récupération.
  let alternations = 0;
  const ordered = [...laps].sort((a, b) => a.index - b.index);
  for (let index = 1; index < ordered.length; index += 1) {
    if (fastIndexes.has(ordered[index].index) !== fastIndexes.has(ordered[index - 1].index)) alternations += 1;
  }
  if (alternations < 4) return null;
  const reps = split.fast;
  const speeds = reps.map((lap) => lap.averageSpeedMps as number);
  const averageSpeed = mean(speeds) as number;
  const third = Math.max(1, Math.floor(reps.length / 3));
  const firstSpeed = mean(speeds.slice(0, third)) as number;
  const lastSpeed = mean(speeds.slice(-third)) as number;
  const recoveries = ordered.filter((lap, index) => !fastIndexes.has(lap.index) && index > 0 && index < ordered.length - 1 && fastIndexes.has(ordered[index - 1].index) && fastIndexes.has(ordered[index + 1]?.index ?? -1));
  const heartRates = present(reps.map((lap) => lap.averageHeartRateBpm));
  const peaks = present(reps.map((lap) => lap.maxHeartRateBpm));
  const distances = present(reps.map((lap) => lap.distanceM));
  return {
    reps: reps.length,
    averageDurationS: round(mean(reps.map((lap) => lap.durationS)) as number),
    averageDistanceM: distances.length ? round(mean(distances) as number) : null,
    averageSpeedMps: round(averageSpeed, 3),
    averageHeartRateBpm: heartRates.length ? round(mean(heartRates) as number, 1) : null,
    peakHeartRateBpm: peaks.length ? round(mean(peaks) as number, 1) : null,
    speedCvPct: reps.length >= 2 ? round(((standardDeviation(speeds) as number) / averageSpeed) * 100, 1) : null,
    fadePct: reps.length >= 3 ? round((firstSpeed / lastSpeed - 1) * 100, 1) : null,
    paceSpreadSPerKm: reps.length >= 2 ? paceSeconds(Math.min(...speeds)) - paceSeconds(Math.max(...speeds)) : null,
    fadeSPerKm: reps.length >= 3 ? paceSeconds(lastSpeed) - paceSeconds(firstSpeed) : null,
    averageRecoveryS: recoveries.length ? round(mean(recoveries.map((lap) => lap.durationS)) as number) : null,
    repsDetail: reps.map((lap) => {
      const position = ordered.findIndex((candidate) => candidate.index === lap.index);
      const next = ordered[position + 1];
      return {
        startOffsetS: lap.startOffsetS,
        durationS: lap.durationS,
        distanceM: lap.distanceM,
        speedMps: lap.averageSpeedMps as number,
        heartRateBpm: lap.averageHeartRateBpm,
        maxHeartRateBpm: lap.maxHeartRateBpm,
        recoveryAfterS: next && !fastIndexes.has(next.index) && ordered[position + 2] && fastIndexes.has(ordered[position + 2].index) ? next.durationS : null,
      };
    }),
  };
}

const DYNAMICS_KEYS = ["cadenceSpm", "groundContactMs", "verticalOscillationMm", "verticalRatioPct", "stepLengthMm"] as const;

function dynamicsOver(streams: ActivityStreams, ranges: Array<[number, number]>): DynamicsValues {
  const sums: Record<(typeof DYNAMICS_KEYS)[number], number[]> = { cadenceSpm: [], groundContactMs: [], verticalOscillationMm: [], verticalRatioPct: [], stepLengthMm: [] };
  streams.timeS.forEach((time, index) => {
    if (!ranges.some(([from, to]) => time >= from && time <= to)) return;
    const speed = streams.speedMps[index];
    // Uniquement les échantillons courus : la marche et les arrêts faussent la foulée.
    if (speed == null || speed < MIN_RUNNING_SPEED) return;
    for (const key of DYNAMICS_KEYS) {
      const value = streams[key]?.[index];
      if (value != null) sums[key].push(value);
    }
  });
  const avg = (values: number[], digits: number) => (values.length >= 30 ? round(mean(values) as number, digits) : null);
  const step = avg(sums.stepLengthMm, 0);
  return {
    cadenceSpm: avg(sums.cadenceSpm, 0),
    groundContactMs: avg(sums.groundContactMs, 0),
    verticalOscillationMm: avg(sums.verticalOscillationMm, 0),
    verticalRatioPct: avg(sums.verticalRatioPct, 1),
    stepLengthM: step == null ? null : round(step / 1000, 2),
  };
}

export function computeDynamics(streams: ActivityStreams | null, work: WorkBlock | null): RunningDynamics | null {
  if (!streams) return null;
  const hasDynamics = DYNAMICS_KEYS.slice(1).some((key) => streams[key]?.some((value) => value != null));
  const end = streams.timeS.at(-1) ?? 0;
  if (work && work.repsDetail.length >= 2) {
    const ranges = work.repsDetail.map((rep) => [rep.startOffsetS, rep.startOffsetS + rep.durationS] as [number, number]);
    const overall = dynamicsOver(streams, ranges);
    if (!hasDynamics && overall.cadenceSpm == null) return null;
    return { ...overall, basis: "reps", early: dynamicsOver(streams, [ranges[0]]), late: dynamicsOver(streams, [ranges[ranges.length - 1]]) };
  }
  if (end < WARMUP_SKIP_S + 600) return null;
  const middle = WARMUP_SKIP_S + (end - WARMUP_SKIP_S) / 2;
  const overall = dynamicsOver(streams, [[WARMUP_SKIP_S, end]]);
  if (!hasDynamics && overall.cadenceSpm == null) return null;
  return { ...overall, basis: "running", early: dynamicsOver(streams, [[WARMUP_SKIP_S, middle]]), late: dynamicsOver(streams, [[middle, end]]) };
}

const BLOCK_M = 5000;

function computeBlocks(streams: ActivityStreams, distanceM: number | null): ActivityMetrics["blocks"] {
  if (!distanceM || distanceM < 12_000) return null;
  const blocks: NonNullable<ActivityMetrics["blocks"]> = [];
  let startIndex = 0;
  for (let index = 1; index < streams.timeS.length; index += 1) {
    const startDistance = streams.distanceM[startIndex];
    const distance = streams.distanceM[index];
    if (startDistance == null || distance == null) continue;
    const isLast = index === streams.timeS.length - 1;
    if (distance - startDistance >= BLOCK_M || (isLast && distance - startDistance >= 1000)) {
      const elapsed = streams.timeS[index] - streams.timeS[startIndex];
      const heartRates = present(streams.heartRateBpm.slice(startIndex, index + 1));
      if (elapsed > 0) blocks.push({ fromKm: round(startDistance / 1000, 1), toKm: round(distance / 1000, 1), speedMps: round((distance - startDistance) / elapsed, 3), heartRateBpm: heartRates.length ? round(mean(heartRates) as number, 0) : null });
      startIndex = index;
    }
  }
  return blocks.length >= 2 ? blocks : null;
}

function computeZoneShares(input: MetricsInput): ActivityMetrics["zoneShares"] {
  const counts = [0, 0, 0, 0, 0];
  if (input.streams) {
    for (const heartRate of input.streams.heartRateBpm) {
      if (heartRate == null) continue;
      const zone = zoneOf(heartRate, input.zones);
      counts[Math.max(1, zone) - 1] += 1;
    }
  } else if (input.hrTimeInZonesS) {
    input.hrTimeInZonesS.forEach((seconds, index) => (counts[index] = seconds));
  }
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return counts.map((value) => round(value / total, 3)) as [number, number, number, number, number];
}

/** Au-delà, une course continue est une sortie longue, quelle que soit son étiquette. */
const LONG_RUN_S = 90 * 60;
/** Étiquette « seuil / VO2max » de la montre retenue seulement avec au moins cette part du temps en Z4–Z5. */
const LABEL_CONFIRM_HIGH_SHARE = 0.25;
/** Étiquette « tempo » retenue seulement si la séance n'est pas à ce point en Z1–Z2. */
const LABEL_TEMPO_MAX_EASY_SHARE = 0.6;

/** Répétitions longues : format de seuil sauf FC moyenne nettement au-dessus de la FC seuil. */
const LONG_REP_S = 360;
const LONG_REP_M = 1600;
const LONG_REP_VO2_MARGIN_BPM = 8;

/**
 * Sans FC seuil mesurée par la montre, le plancher de Z4 vient d'un % de FC max : une estimation
 * à quelques bpm près. Un fractionné n'est alors « tempo » que nettement en dessous (5 bpm), sinon
 * deux séances identiques à 4 bpm d'écart changent de type et de couleur.
 */
const GENERIC_ZONES_TEMPO_MARGIN_BPM = 5;

export function classifyKind(input: { work: WorkBlock | null; zoneShares: ActivityMetrics["zoneShares"]; movingTimeS: number | null; distanceM: number | null; zones: HeartRateZones; trainingEffectLabel?: string | null; zonesRecalibrated?: boolean; averageHeartRateBpm?: number | null }): SessionKind {
  const { work, zoneShares, zones } = input;
  const tempoBelow = zones.floors[3] - (zones.lactateThresholdHeartRateBpm == null ? GENERIC_ZONES_TEMPO_MARGIN_BPM : 0);
  if (work) {
    if (work.averageDurationS < 75) return "intervals_short";
    // Répétitions longues (≥ 6 min ou ≥ 1 600 m) : format de seuil (« cruise intervals »), jugé sur la FC seuil de la montre
    // et non sur le plancher de Z5, qui peut se trouver sous la FC seuil (zones Garmin). Nettement au-dessus : VO2max.
    if ((work.averageDurationS >= LONG_REP_S || (work.averageDistanceM ?? 0) >= LONG_REP_M) && work.averageHeartRateBpm != null) {
      const thresholdHr = zones.lactateThresholdHeartRateBpm ?? zones.floors[4];
      if (work.averageHeartRateBpm > thresholdHr + LONG_REP_VO2_MARGIN_BPM) return "intervals_vo2";
      if (work.averageHeartRateBpm >= tempoBelow) return "intervals_threshold";
      return "intervals_tempo";
    }
    // Répétitions longues : la FC moyenne dit l'intensité ; courtes : la FC atteinte en fin de rep.
    const reference = work.averageDurationS >= 300 ? (work.averageHeartRateBpm ?? work.peakHeartRateBpm) : (work.peakHeartRateBpm ?? work.averageHeartRateBpm);
    if (reference != null && reference >= zones.floors[4]) return "intervals_vo2";
    if (reference != null && reference >= tempoBelow) return "intervals_threshold";
    return "intervals_tempo";
  }
  const duration = input.movingTimeS ?? 0;
  const distance = input.distanceM ?? 0;
  const high = zoneShares ? zoneShares[3] + zoneShares[4] : 0;
  const moderate = zoneShares ? zoneShares[2] : 0;
  const easyShare = zoneShares ? zoneShares[0] + zoneShares[1] : null;
  const label = input.trainingEffectLabel ?? null;
  const watchSaysEasy = label === "AEROBIC_BASE" || label === "RECOVERY";
  const watchSaysHard = label === "LACTATE_THRESHOLD" || label === "VO2MAX" || label === "ANAEROBIC_CAPACITY";
  // Zones recalées sur ses footings (zones génériques trop basses pour lui) : l'étiquette de la montre,
  // calculée avec ces mêmes zones génériques, ne suffit plus seule.
  // - La durée d'abord : 90 min et plus, c'est une sortie longue (une course longue menée fort reste une
  //   sortie longue ; la consigne tient compte de l'intensité).
  // - « Seuil » demande un peu de temps en Z4 ou plus ; « tempo », que la séance ne soit pas surtout en Z1–Z2.
  // Zones mesurées (FC seuil) ou cohérentes avec ses footings : comportement inchangé.
  const strict = input.zonesRecalibrated === true;
  if (strict && duration >= LONG_RUN_S) return "long";
  const hardConfirmed = !strict || !zoneShares || high >= LABEL_CONFIRM_HIGH_SHARE;
  const tempoConfirmed = !strict || easyShare == null || easyShare < LABEL_TEMPO_MAX_EASY_SHARE;
  // Zones recalées : « seuil » exige aussi une FC moyenne en Z4 (sinon c'est un tempo, souvent progressif).
  const averageHr = input.averageHeartRateBpm ?? null;
  const thresholdHrConfirmed = !strict || averageHr == null || averageHr >= input.zones.floors[3];
  if (!watchSaysEasy) {
    if ((high >= 0.5 || (watchSaysHard && hardConfirmed)) && thresholdHrConfirmed) return "threshold";
    if ((high + moderate >= 0.5 || ((label === "TEMPO" || watchSaysHard) && tempoConfirmed)) && duration < 75 * 60) return "tempo";
  } else if (high >= 0.6) {
    return "threshold";
  }
  if (duration >= 75 * 60 || distance >= 16_000) return "long";
  if (duration < 35 * 60 && zoneShares && zoneShares[0] + zoneShares[1] >= 0.8) return "recovery";
  return "endurance";
}

export function computeActivityMetrics(input: MetricsInput): ActivityMetrics {
  const rest = input.restingHeartRateBpm;
  const windows = input.streams ? buildWindows(input.streams) : [];
  const work = detectWorkBlock(input.laps);
  const zoneShares = computeZoneShares(input);
  const kind = classifyKind({ work, zoneShares, movingTimeS: input.movingTimeS, distanceM: input.distanceM, zones: input.zones, trainingEffectLabel: input.trainingEffectLabel, zonesRecalibrated: input.zonesRecalibrated, averageHeartRateBpm: input.averageHeartRateBpm });
  const end = input.streams?.timeS.at(-1) ?? 0;
  const main = input.streams && end > WARMUP_SKIP_S + 120 ? segmentAverage(input.streams, WARMUP_SKIP_S, end) : null;
  return {
    version: METRICS_VERSION,
    restingHeartRateUsed: rest,
    kind,
    family: familyOf(kind),
    structure: work ? "intervals" : "continuous",
    mainSpeedMps: main?.speedMps ?? input.averageSpeedMps,
    mainHeartRateBpm: main?.heartRateBpm ?? input.averageHeartRateBpm,
    halves: input.streams && !work ? computeHalves(input.streams) : null,
    work,
    aerobic: windows.length ? computeAerobic(windows, input.zones, rest) : null,
    zoneShares,
    elevationGainPerKm: input.elevationGainM != null && input.distanceM ? round(input.elevationGainM / (input.distanceM / 1000), 1) : null,
    averageCadenceSpm: input.averageCadenceSpm,
    blocks: input.streams && !work ? computeBlocks(input.streams, input.distanceM) : null,
    dynamics: computeDynamics(input.streams, work),
  };
}

export function zoneIndexes(): ZoneIndex[] {
  return [1, 2, 3, 4, 5];
}
