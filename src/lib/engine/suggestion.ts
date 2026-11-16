import { addDays, daysBetween } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/formatters";
import type { HeartRateZones } from "@/lib/source/types";
import type { SessionFamily, SessionKind } from "./activity-metrics";
import { SESSION_KIND_LABELS } from "./activity-metrics";
import { HIGH_LOAD_RATIO, type LoadAlert, type LoadSummary } from "./load";
import type { RecoverySignals } from "./recovery";
import { median, present, round } from "./stats";
import { intervalTarget, type RaceTarget, type RecentEffort } from "./prescription";
import { zoneRange } from "./zones";

/**
 * Suggestion de prochaine séance, 100 % déterministe (Claude ne fait que la
 * commenter). Pensée pour le rythme réel de l'athlète (1 à 2 courses par
 * semaine) : la prochaine séance, puis celle d'après en une ligne. Jamais un
 * plan sur 5 jours.
 */

export type SuggestionType = "endurance" | "long" | "threshold" | "vo2max" | "specific" | "taper" | "race" | "recovery_run" | "rest";

export type SessionTarget = { zone: string; heartRateLow: number; heartRateHigh: number; paceFastMps: number | null; paceSlowMps: number | null };

export type SuggestedSession = {
  type: SuggestionType;
  title: string;
  durationMin: number;
  /** Déroulé, sans répéter les cibles (affichées à part). */
  structure: string;
  target: SessionTarget | null;
};

export type Suggestion = {
  primary: SuggestedSession;
  when: { date: string; label: string };
  reason: string;
  /** Proposée quand les signaux de récupération sont dégradés. */
  alternative: (SuggestedSession & { reason: string }) | null;
  /** La séance d'après, si la prochaine est faite comme prévu. */
  then: { title: string; durationMin: number; type: SuggestionType; when: { date: string; label: string } } | null;
  facts: {
    daysSinceLastRun: number | null;
    lastRunKind: string | null;
    daysSinceLastQuality: number | null;
    daysSinceLastLong: number | null;
    highIntensityShare28d: number | null;
    loadRatio: number | null;
    recoveryState: RecoverySignals["state"];
    recoveryFlags: RecoverySignals["flags"];
    runsPerWeek8w: number;
    plannedRunsPerWeek: number;
    daysToEvent: number | null;
  };
};

export type SuggestionRun = {
  localDate: string;
  kind: SessionKind;
  family: SessionFamily;
  movingTimeS: number | null;
  aerobicTrainingEffect: number | null;
  /** Intitulé lisible (« Fractionné long 3 × 2 km »), sinon le type. */
  title?: string;
};

export type SuggestionGoal = {
  eventDate: string | null;
  distanceKm: number | null;
  targetPaceMps: number | null;
  runsPerWeek: number;
  /** 0 = lundi … 6 = dimanche. */
  preferredDays: number[];
};

export type SuggestionInput = {
  today: string;
  runs: SuggestionRun[]; // plus anciennes d'abord
  zones: HeartRateZones;
  restingHeartRateBpm: number;
  /** Efficacité aérobie récente (m/s par bpm au-dessus du repos), pour traduire une FC cible en allure. */
  recentSpeedPerBeat: number | null;
  /** FC habituelle de ses sorties faciles (centre de la cible en endurance). */
  easyHeartRateBpm: number | null;
  lactateThresholdSpeedMps: number | null;
  load: LoadSummary;
  recovery: RecoverySignals;
  goal?: SuggestionGoal | null;
  /** Objectifs chiffrés : les allures des séances de qualité en tiennent compte. */
  raceTargets?: RaceTarget[];
  /** Répétitions longues récentes : affinent l'allure 5 km du moment. */
  efforts?: RecentEffort[];
  /** Hausse de charge corroborée ou non ; sans lui, le ratio seul décide (ancien comportement). */
  loadAlert?: LoadAlert | null;
};

const HARD_FAMILIES: ReadonlySet<SessionFamily> = new Set(["intervals", "steady"]);
/** Demi-largeur de la fourchette d'allure affichée en endurance (s/km). */
const EASY_PACE_HALF_RANGE_S = 8;

function isHard(run: SuggestionRun): boolean {
  return HARD_FAMILIES.has(run.family) || (run.aerobicTrainingEffect ?? 0) >= 4;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function roundTo5(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function paceAround(speedMps: number, halfRangeS: number): { paceFastMps: number; paceSlowMps: number } {
  const seconds = 1000 / speedMps;
  return { paceFastMps: round(1000 / (seconds - halfRangeS), 3), paceSlowMps: round(1000 / (seconds + halfRangeS), 3) };
}

function easyTarget(input: SuggestionInput, zone: 1 | 2 = 2): SessionTarget {
  const [zoneLow, zoneHigh] = zoneRange(2, input.zones);
  const center = zone === 1 ? zoneLow : Math.min(zoneHigh - 3, Math.max(zoneLow + 3, input.easyHeartRateBpm ?? Math.round((zoneLow + zoneHigh) / 2)));
  const low = Math.max(zone === 1 ? input.zones.floors[0] : zoneLow, center - 5);
  const high = Math.min(zoneHigh, center + 5);
  const pace = input.recentSpeedPerBeat ? paceAround(input.recentSpeedPerBeat * (center - input.restingHeartRateBpm), EASY_PACE_HALF_RANGE_S) : { paceFastMps: null, paceSlowMps: null };
  return { zone: zone === 1 ? "Z1–Z2" : "Z2", heartRateLow: low, heartRateHigh: high, ...pace };
}

function enduranceSession(input: SuggestionInput, durationMin: number, title = "Endurance fondamentale", type: SuggestionType = "endurance"): SuggestedSession {
  const structure = type === "long"
    ? "En continu et régulier ; les 15 dernières minutes doivent être aussi faciles que les 15 premières."
    : "En continu, en aisance respiratoire : tu dois pouvoir parler en phrases complètes.";
  return { type, title, durationMin, structure, target: easyTarget(input) };
}

/** Cible partagée avec les consignes de séance : mêmes allures dans la suggestion et dans l'analyse. */
function sharedTarget(input: SuggestionInput, kind: SessionKind, repDurationS: number, zone: string): SessionTarget | null {
  const target = intervalTarget(kind, repDurationS, { zones: input.zones, lactateThresholdSpeedMps: input.lactateThresholdSpeedMps, raceTargets: input.raceTargets ?? [], efforts: input.efforts ?? [] });
  if (!target) return null;
  return { zone, heartRateLow: target.heartRateLow, heartRateHigh: target.heartRateHigh, paceFastMps: target.paceFastS ? round(1000 / target.paceFastS, 3) : null, paceSlowMps: target.paceSlowS ? round(1000 / target.paceSlowS, 3) : null };
}

function thresholdSession(input: SuggestionInput): SuggestedSession {
  return {
    type: "threshold",
    title: "Seuil : 3 × 10 min",
    durationMin: 60,
    structure: "15 min d'échauffement facile, 3 × 10 min au seuil avec 2 min de trot entre, 10 min de retour au calme.",
    target: sharedTarget(input, "intervals_threshold", 600, "Z4"),
  };
}

function vo2Session(input: SuggestionInput): SuggestedSession {
  return {
    type: "vo2max",
    title: "VO2max : 5 × 3 min",
    durationMin: 50,
    structure: "15 min d'échauffement avec 3 accélérations, 5 × 3 min avec 2 min de trot entre (la FC atteint la cible en fin de répétition), 10 min de retour au calme.",
    target: sharedTarget(input, "intervals_vo2", 180, "Z5"),
  };
}

function specificSession(input: SuggestionInput, goal: SuggestionGoal): SuggestedSession {
  const pace = goal.targetPaceMps as number;
  const long = (goal.distanceKm ?? 10) >= 10;
  return {
    type: "specific",
    title: long ? "Spécifique : 3 × 2 km à allure objectif" : "Spécifique : 5 × 1 km à allure objectif",
    durationMin: long ? 60 : 50,
    structure: long ? "15 min d'échauffement, 3 × 2 km à l'allure visée le jour J avec 2 min de trot entre, 10 min de retour au calme." : "15 min d'échauffement, 5 × 1 km à l'allure visée le jour J avec 1 min 30 de trot entre, 10 min de retour au calme.",
    target: { zone: "allure objectif", heartRateLow: zoneRange(4, input.zones)[0], heartRateHigh: zoneRange(5, input.zones)[1], ...paceAround(pace, 2) },
  };
}

function taperSession(input: SuggestionInput, goal: SuggestionGoal): SuggestedSession {
  const target = goal.targetPaceMps ? { zone: "allure objectif", heartRateLow: zoneRange(4, input.zones)[0], heartRateHigh: zoneRange(4, input.zones)[1], ...paceAround(goal.targetPaceMps, 3) } : easyTarget(input);
  return { type: "taper", title: "Affûtage : 30 min + 4 × 1 min", durationMin: 35, structure: "30 min faciles puis 4 × 1 min à l'allure du jour J, 1 min de trot entre. Rien de plus : la forme se garde, elle ne se gagne plus.", target };
}

function weekday(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** Premier jour préféré à partir de `date` (inclus), dans les 7 jours. */
function snapToPreferredDay(date: string, preferredDays: number[]): string {
  if (!preferredDays.length) return date;
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = addDays(date, offset);
    if (preferredDays.includes(weekday(candidate))) return candidate;
  }
  return date;
}

function whenLabel(date: string, today: string): string {
  const offset = daysBetween(today, date);
  if (offset <= 0) return "Aujourd'hui";
  if (offset === 1) return "Demain";
  const label = formatDate(date, "long");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function kindOf(type: SuggestionType): { kind: SessionKind; family: SessionFamily; hard: boolean } {
  if (type === "long") return { kind: "long", family: "long", hard: false };
  if (type === "threshold") return { kind: "intervals_threshold", family: "intervals", hard: true };
  if (type === "vo2max") return { kind: "intervals_vo2", family: "intervals", hard: true };
  if (type === "specific") return { kind: "intervals_threshold", family: "intervals", hard: true };
  if (type === "race") return { kind: "threshold", family: "steady", hard: true };
  return { kind: "endurance", family: "easy", hard: false };
}

type Core = { primary: SuggestedSession; reason: string; when: string };

function decide(input: SuggestionInput, labelToday: string): Core & { facts: Suggestion["facts"] } {
  const { today, runs, load, recovery } = input;
  const goal = input.goal ?? null;
  const lastRun = runs.at(-1) ?? null;
  const lastHard = [...runs].reverse().find(isHard) ?? null;
  const lastQuality = [...runs].reverse().find((run) => run.family === "intervals" || run.family === "steady") ?? null;
  const lastLong = [...runs].reverse().find((run) => run.family === "long") ?? null;
  const since = (run: SuggestionRun | null) => (run ? daysBetween(run.localDate, today) : null);

  const daysSinceLastRun = since(lastRun);
  const daysSinceLastQuality = since(lastQuality);
  const daysSinceLastLong = since(lastLong);
  const highShare = load.intensity28d?.high ?? null;
  const plannedRunsPerWeek = goal?.runsPerWeek ?? Math.max(1, Math.round(load.runsPerWeek8w));
  const daysToEvent = goal?.eventDate ? daysBetween(today, goal.eventDate) : null;

  const recent8w = runs.filter((run) => daysBetween(run.localDate, today) < 56);
  const easyDurations = present(recent8w.filter((run) => run.family === "easy").map((run) => run.movingTimeS));
  const typicalEasyMin = easyDurations.length ? (median(easyDurations) as number) / 60 : 45;
  const longest8w = Math.max(0, ...present(recent8w.map((run) => run.movingTimeS))) / 60;
  const easyDuration = roundTo5(Math.min(60, Math.max(40, typicalEasyMin)));

  const qualitySession = (): { session: SuggestedSession; why: string } => {
    if (goal?.targetPaceMps && daysToEvent != null && daysToEvent >= 7 && daysToEvent <= 28) {
      return { session: specificSession(input, goal), why: `Ta course est dans ${daysToEvent} jours : place l'allure visée maintenant, dans les jambes et dans la tête.` };
    }
    const lastWasVo2 = lastQuality?.kind === "intervals_vo2" || lastQuality?.kind === "intervals_short";
    const lastWasThreshold = lastQuality?.kind === "intervals_threshold" || lastQuality?.kind === "threshold";
    const session = lastWasVo2 ? thresholdSession(input) : lastWasThreshold ? vo2Session(input) : thresholdSession(input);
    const why = daysSinceLastQuality == null
      ? "Pas de séance de qualité récente : avec peu de sorties par semaine, c'est le travail structuré qui fait progresser."
      : `Ta dernière séance de qualité date de ${daysSinceLastQuality} jours ; on alterne seuil et VO2max d'une fois à l'autre.`;
    return { session, why };
  };

  let primary: SuggestedSession;
  let reason: string;

  if (daysToEvent === 0) {
    primary = { type: "race", title: "Jour de course", durationMin: 0, structure: "Échauffement de 15 min avec quelques accélérations, puis départ prudent les 2 premiers kilomètres.", target: goal?.targetPaceMps ? { zone: "allure objectif", heartRateLow: zoneRange(4, input.zones)[0], heartRateHigh: zoneRange(5, input.zones)[1], ...paceAround(goal.targetPaceMps, 2) } : null };
    reason = "C'est le jour J.";
  } else if (daysToEvent != null && daysToEvent > 0 && daysToEvent <= 6 && goal) {
    primary = taperSession(input, goal);
    reason = `Course dans ${daysToEvent} jour${daysToEvent > 1 ? "s" : ""} : on garde le rythme sans fatiguer.`;
  } else if (daysSinceLastRun == null || daysSinceLastRun >= 14) {
    primary = enduranceSession(input, 40, "Reprise en endurance");
    reason = daysSinceLastRun == null ? "Aucune course récente : on repart sur une base aérobie facile." : `Ta dernière course date de ${daysSinceLastRun} jours : on reprend en endurance avant de remettre de l'intensité.`;
  } else if (load.ratio != null && load.ratio >= HIGH_LOAD_RATIO && (input.loadAlert == null || input.loadAlert.actionable)) {
    primary = enduranceSession(input, roundTo5(Math.min(50, typicalEasyMin)));
    const why = input.loadAlert?.reasons.length ? `, avec ${input.loadAlert.reasons.join(", ")}` : "";
    reason = `Ta charge des 7 derniers jours vaut ${formatNumber(load.ratio, 1)} fois ta moyenne${why} : on absorbe avec une séance facile.`;
  } else if (lastHard && lastRun === lastHard && daysBetween(lastHard.localDate, today) < 3) {
    primary = enduranceSession(input, easyDuration);
    reason = `Ta dernière course (${lowerFirst(lastHard.title ?? SESSION_KIND_LABELS[lastHard.kind])}) était exigeante : la suivante reste facile pour que le travail paie.`;
  } else if (highShare != null && highShare >= 0.4 && lastRun && lastRun.family !== "easy") {
    primary = enduranceSession(input, easyDuration);
    reason = `${formatNumber(highShare * 100)} % de ton temps des 4 dernières semaines était en Z4–Z5 : une vraie séance en Z2 rééquilibre.`;
  } else if (plannedRunsPerWeek <= 1 && lastRun && lastRun.family !== "intervals" && lastRun.family !== "steady") {
    ({ session: primary, why: reason } = qualitySession());
  } else if (plannedRunsPerWeek <= 1 && (daysSinceLastLong == null || daysSinceLastLong >= 14)) {
    primary = enduranceSession(input, roundTo5(Math.min(120, Math.max(70, longest8w * 1.1))), "Sortie longue", "long");
    reason = "Une sortie par semaine : on alterne qualité et sortie longue, et c'est le tour de la longue.";
  } else if (daysSinceLastQuality == null || daysSinceLastQuality >= 8) {
    ({ session: primary, why: reason } = qualitySession());
  } else if (daysSinceLastLong == null || daysSinceLastLong >= 14) {
    primary = enduranceSession(input, roundTo5(Math.min(120, Math.max(70, longest8w * 1.1))), "Sortie longue", "long");
    reason = daysSinceLastLong == null ? "Pas de sortie longue récente : c'est le meilleur levier d'endurance." : `Ta dernière sortie longue date de ${daysSinceLastLong} jours et la qualité est faite : allonge en restant en Z2.`;
  } else {
    primary = enduranceSession(input, easyDuration);
    reason = "Qualité et sortie longue récentes déjà faites : une endurance facile entretient sans fatiguer.";
  }

  // Quand : 48 h après une séance dure ou longue, 24 h après une facile, 72 h entre deux séances de qualité.
  let earliest = today;
  if (lastRun) {
    const gap = isHard(lastRun) || lastRun.family === "long" ? 2 : 1;
    const candidate = addDays(lastRun.localDate, gap);
    if (candidate > earliest) earliest = candidate;
  }
  if (kindOf(primary.type).hard && lastHard) {
    const candidate = addDays(lastHard.localDate, 3);
    if (candidate > earliest) earliest = candidate;
  }
  if (primary.type !== "race") earliest = snapToPreferredDay(earliest, goal?.preferredDays ?? []);
  if (goal?.eventDate && earliest > goal.eventDate) earliest = goal.eventDate;

  return {
    primary,
    reason,
    when: earliest,
    facts: {
      daysSinceLastRun,
      lastRunKind: lastRun ? (lastRun.title ?? SESSION_KIND_LABELS[lastRun.kind]) : null,
      daysSinceLastQuality,
      daysSinceLastLong,
      highIntensityShare28d: highShare,
      loadRatio: load.ratio,
      recoveryState: recovery.state,
      recoveryFlags: recovery.flags,
      runsPerWeek8w: load.runsPerWeek8w,
      plannedRunsPerWeek,
      daysToEvent: daysToEvent ?? null,
    },
  };
  void labelToday;
}

export function suggestNextSession(input: SuggestionInput): Suggestion {
  const core = decide(input, input.today);
  const { primary } = core;

  let alternative: Suggestion["alternative"] = null;
  const recovery = input.recovery;
  if ((recovery.state === "poor" || recovery.state === "watch") && primary.type !== "endurance" && primary.type !== "race") {
    const flagText = recovery.flags.map((flag) => (flag === "hrv_low" ? "VFC sous ta plage habituelle" : flag === "resting_hr_high" ? "FC de repos au-dessus de ta base" : "nuit courte")).join(", ");
    alternative = { type: "recovery_run", title: "Footing facile", durationMin: 35, structure: "35 min très faciles.", target: easyTarget(input, 1), reason: `Si les signaux restent dégradés le jour J (${flagText}), remplace par ce footing facile.` };
  } else if (recovery.state === "poor") {
    alternative = { type: "rest", title: "Repos ou mobilité", durationMin: 20, structure: "20 min de mobilité ou de marche, pas de course.", target: null, reason: "Si les signaux restent dégradés le jour J, un jour de repos vaut mieux qu'un footing forcé." };
  }

  // La séance d'après : on suppose la prochaine faite comme prévu, sans préjuger de la récupération.
  let then: Suggestion["then"] = null;
  if (primary.type !== "race") {
    const shape = kindOf(primary.type);
    const simulatedRun: SuggestionRun = { localDate: core.when, kind: shape.kind, family: shape.family, movingTimeS: primary.durationMin * 60, aerobicTrainingEffect: shape.hard ? 4.2 : 2.8 };
    const neutralRecovery: RecoverySignals = { ...recovery, flags: [], state: "unknown" };
    const next = decide({ ...input, today: core.when, runs: [...input.runs, simulatedRun], load: { ...input.load, ratio: null }, loadAlert: null, recovery: neutralRecovery }, input.today);
    // Rythme visé : pas plus de N séances par semaine.
    const spacing = Math.max(1, Math.round(7 / next.facts.plannedRunsPerWeek) - 1);
    let date = next.when > core.when ? next.when : addDays(core.when, 1);
    if (daysBetween(core.when, date) < spacing) date = snapToPreferredDay(addDays(core.when, spacing), input.goal?.preferredDays ?? []);
    if (input.goal?.eventDate && date > input.goal.eventDate) date = input.goal.eventDate;
    then = { title: next.primary.title, durationMin: next.primary.durationMin, type: next.primary.type, when: { date, label: whenLabel(date, input.today) } };
  }

  return { primary, when: { date: core.when, label: whenLabel(core.when, input.today) }, reason: core.reason, alternative, then, facts: core.facts };
}
