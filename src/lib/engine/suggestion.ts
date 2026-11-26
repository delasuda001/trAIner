import { addDays, daysBetween, startOfIsoWeek } from "@/lib/dates";
import { easyPaceRange, type EasySample } from "./easy-pace";
import { formatDate, formatNumber, formatPace } from "@/lib/formatters";
import type { HeartRateZones } from "@/lib/source/types";
import type { SessionFamily, SessionKind } from "./activity-metrics";
import { SESSION_KIND_LABELS } from "./activity-metrics";
import { HIGH_LOAD_RATIO, type LoadAlert, type LoadSummary } from "./load";
import { DEFAULT_QUALITY_SPACING_DAYS, type Rhythm } from "./rhythm";
import type { RecoverySignals } from "./recovery";
import { median, present, round } from "./stats";
import { intervalTarget, isRaceLikeEffort, type RaceTarget, type RecentEffort } from "./prescription";
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

/**
 * Options équivalentes (plans B et C) : même fonction dans la semaine (aérobie facile ou intensité),
 * bénéfice estimé face à la séance recommandée (repère d'entraîneur, pas une mesure).
 */
export type SessionOption = SuggestedSession & {
  key: string;
  role: "aerobic" | "intensity";
  /** Part du bénéfice de la séance recommandée (0,7 = « ≈ 70 % du bénéfice »). */
  benefit: number;
  /** Ce qui change par rapport à la séance recommandée, en une phrase. */
  note: string;
  /** Course à pied ou non (vélo, elliptique) : une option sans course ne compte pas comme sortie. */
  running: boolean;
};

export type Suggestion = {
  primary: SuggestedSession;
  /** Deux options équivalentes au plus (vide pour repos, course, affûtage, séance spécifique). */
  options: SessionOption[];
  /** Option choisie par le coureur (clé), si elle vaut pour cette séance : la suite est recalée dessus. */
  chosen: string | null;
  /**
   * Quand : `date` est le premier jour conseillé, `dates` la fenêtre (1 ou 2 jours
   * consécutifs, une seule séance à placer dedans), `label` la fenêtre en clair
   * (« Mardi ou mercredi », « Aujourd'hui »).
   */
  when: { date: string; label: string; dates: string[] };
  /** Le pourquoi en langage de coureur (pas de charge brute, de ratio ni de médiane). */
  reason: string;
  /** Les chiffres derrière le pourquoi, pour « Le détail » (charge, ratio) ; absent si le pourquoi se suffit. */
  reasonDetail?: string;
  /** Proposée quand les signaux de récupération sont dégradés. */
  alternative: (SuggestedSession & { reason: string }) | null;
  /** La séance d'après, si la prochaine est faite comme prévu. */
  then: { title: string; durationMin: number; type: SuggestionType; when: { date: string; label: string }; /** Détail pour la fenêtre « Ensuite » (déroulé, cible, pourquoi). */ structure?: string; target?: SessionTarget | null; reason?: string } | null;
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
  distanceM?: number | null;
};

/**
 * Semaine type demandée par l'écart à l'objectif (cf. engine/goal-gap) quand le levier
 * principal est la fréquence, le volume ou la sortie longue : nombre de sorties visé,
 * et sortie longue chiffrée en km, progressive.
 */
export type WeekPlan = {
  runsPerWeek: number;
  longRunKm: number;
  /** Vrai si la sortie longue gagne 2 km cette fois-ci (sinon on consolide). */
  longRunStep: boolean;
  /** Plus longue sortie des 8 dernières semaines (km). */
  longestKm: number;
  /** Levier en clair : « la fréquence », « la sortie longue »… */
  lever: string;
  race: string;
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
  /** Footings des 12 dernières semaines (allure, FC) : bornent l'allure facile proposée (voir easy-pace.ts). */
  easySamples?: EasySample[];
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
  /** Rythme habituel (cf. engine/rhythm) : écart entre séances de qualité et seuil de charge ; défauts 3 jours et 1,5. */
  rhythm?: Pick<Rhythm, "qualitySpacingDays" | "highLoadRatio"> | null;
  /** Semaine type alignée sur le levier principal de l'objectif ; sans elle, comportement d'origine. */
  weekPlan?: WeekPlan | null;
  /**
   * Contrainte de la semaine dite au coach (« je ne peux faire que 2 séances », « pas mardi ») : ne vaut que
   * pour la semaine `weekStart` (lundi). Plafonne les sorties de la semaine et écarte les jours indisponibles.
   */
  weekConstraint?: WeekConstraint | null;
  /** Option choisie pour la prochaine séance (clé de `options`) : la séance d'après est recalée en conséquence. */
  chosenOption?: string | null;
  /**
   * Coureur débutant (cf. engine/athlete-level) : ni seuil ni VO2max. Une sortie sur deux est ludique
   * (accélérations, fartlek, footing progressif), l'autre un peu plus longue, toujours facile.
   */
  beginner?: boolean;
};

export type WeekConstraint = { weekStart: string; runsThisWeek: number | null; /** 0 = lundi … 6 = dimanche. */ unavailableDays: number[] };

const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Phrase de rappel de la contrainte (« Cette semaine : 2 sorties possibles, pas mardi ni jeudi. »). */
export function constraintSentence(constraint: WeekConstraint): string {
  const parts = [constraint.runsThisWeek != null ? `${constraint.runsThisWeek} sortie${constraint.runsThisWeek > 1 ? "s" : ""} possible${constraint.runsThisWeek > 1 ? "s" : ""}` : null, constraint.unavailableDays.length ? `pas ${constraint.unavailableDays.map((day) => DAY_NAMES[day]).join(" ni ")}` : null].filter(Boolean);
  return `Cette semaine, tu as indiqué : ${parts.join(", ")}. La proposition en tient compte.`;
}

/** Footing ajouté pour la 3e sortie (min). */
const FOOTING_MIN = 35;
/** Avec une semaine type, une séance de qualité par semaine : elle revient après 5 jours. */
const WEEKLY_QUALITY_DAYS = 5;

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
  const modelled = input.recentSpeedPerBeat ? paceAround(input.recentSpeedPerBeat * (center - input.restingHeartRateBpm), EASY_PACE_HALF_RANGE_S) : null;
  // Récupération (zone 1) : volontairement plus lente que les footings, modèle seul.
  const range = zone === 1 ? null : easyPaceRange(modelled ? { fastS: 1000 / modelled.paceFastMps, slowS: 1000 / modelled.paceSlowMps } : null, { heartRateLow: low, heartRateHigh: high }, input.easySamples);
  const pace = range && (!modelled || Math.round(range.slowS) !== Math.round(1000 / modelled.paceSlowMps) || Math.round(range.fastS) !== Math.round(1000 / modelled.paceFastMps))
    ? { paceFastMps: round(1000 / range.fastS, 3), paceSlowMps: round(1000 / range.slowS, 3) }
    : (modelled ?? { paceFastMps: null, paceSlowMps: null });
  return { zone: zone === 1 ? "Z1–Z2" : "Z2", heartRateLow: low, heartRateHigh: high, ...pace };
}

function enduranceSession(input: SuggestionInput, durationMin: number, title = "Endurance fondamentale", type: SuggestionType = "endurance"): SuggestedSession {
  const structure = type === "long"
    ? "En continu et régulier ; les 15 dernières minutes doivent être aussi faciles que les 15 premières."
    : "En continu, en aisance respiratoire : tu dois pouvoir parler en phrases complètes.";
  return { type, title, durationMin, structure, target: easyTarget(input) };
}

/** Sortie longue chiffrée en km : durée estimée à l'allure facile du moment (6:30/km faute de mieux). */
function longRunSession(input: SuggestionInput, plan: WeekPlan): SuggestedSession {
  const target = easyTarget(input);
  const speed = target.paceFastMps != null && target.paceSlowMps != null ? (target.paceFastMps + target.paceSlowMps) / 2 : 1000 / 390;
  const durationMin = roundTo5((plan.longRunKm * 1000) / speed / 60);
  const formatKm = (km: number) => formatNumber(km, Number.isInteger(km) ? 0 : 1);
  return {
    type: "long",
    title: `Sortie longue : ${plan.longRunKm} km`,
    durationMin,
    structure: `${plan.longRunKm} km en continu et réguliers (ta plus longue des 8 dernières semaines : ${formatKm(plan.longestKm)} km) ; les 15 dernières minutes aussi faciles que les 15 premières.`,
    target,
  };
}

/** Séances ludiques du débutant, à tour de rôle : de l'allure sans séance au seuil ni VO2max. */
function playfulSession(input: SuggestionInput, durationMin: number, turn: number): SuggestedSession {
  const target = easyTarget(input);
  const sessions: Array<Pick<SuggestedSession, "title" | "structure">> = [
    { title: "Footing + accélérations", structure: `${durationMin - 5} min faciles, puis 6 accélérations de 20 s, relâchées, sans sprinter (1 min de marche ou de trot entre), et 5 min tranquilles pour finir.` },
    { title: "Fartlek ludique", structure: `10 min faciles, puis 6 fois : 1 min un peu plus vite (on peut encore parler par mots) et 2 min faciles ; finir en trottinant jusqu'à ${durationMin} min.` },
    { title: "Footing progressif", structure: `${durationMin} min : les deux premiers tiers en aisance, le dernier tiers un peu plus vite, sans jamais être essoufflé.` },
  ];
  return { type: "endurance", durationMin, target, ...sessions[turn % sessions.length] };
}

function footingSession(input: SuggestionInput): SuggestedSession {
  return { type: "endurance", title: `Footing facile : ${FOOTING_MIN} min`, durationMin: FOOTING_MIN, structure: "Court et vraiment facile, en aisance respiratoire : il ajoute une sortie sans fatiguer.", target: easyTarget(input) };
}

/** Cible partagée avec les consignes de séance : mêmes allures dans la suggestion et dans l'analyse. */
function sharedTarget(input: SuggestionInput, kind: SessionKind, repDurationS: number, zone: string): SessionTarget | null {
  const target = intervalTarget(kind, repDurationS, { zones: input.zones, lactateThresholdSpeedMps: input.lactateThresholdSpeedMps, raceTargets: input.raceTargets ?? [], efforts: input.efforts ?? [] });
  if (!target) return null;
  return { zone, heartRateLow: target.heartRateLow, heartRateHigh: target.heartRateHigh, paceFastMps: target.paceFastS ? round(1000 / target.paceFastS, 3) : null, paceSlowMps: target.paceSlowS ? round(1000 / target.paceSlowS, 3) : null };
}

/**
 * Consigne d'allure d'un fractionné. Sur des répétitions de moins de 8 min, la FC monte en retard : elle ne
 * peut pas guider l'allure, seulement la confirmer en fin de répétition. La cible principale est donc
 * l'allure (calculée sur les résultats du profil), avec une consigne de départ et d'ajustement.
 */
export function pacingCue(target: SessionTarget | null, repMinutes: number): string {
  const short = repMinutes < 8;
  if (target?.paceFastMps && target.paceSlowMps) {
    const range = `${formatPace(target.paceSlowMps)} à ${formatPace(target.paceFastMps)}`;
    return short
      ? ` Repère : l'allure, ${range}. Pars la 1re répétition dans le haut de la fourchette (côté lent), puis ajuste à tes sensations : si tu sens que tu ne tiendras pas la dernière à cette allure, ralentis de 5 s/km. La FC (${target.heartRateLow}–${target.heartRateHigh} bpm) n'est qu'un repère en fin de répétition : elle monte en retard, ne cours pas après.`
      : ` Repère : l'allure, ${range}, contrôlée par la FC (${target.heartRateLow}–${target.heartRateHigh} bpm) : si elle dépasse le haut de la fourchette avant la moitié, ralentis.`;
  }
  return short
    ? " Sans allure de référence fiable : pars à une allure que tu pourrais tenir sur toute la série, la 1re répétition doit sembler contrôlée ; la dernière doit être la plus difficile, pas la seule faisable. La FC monte en retard sur des répétitions courtes : ne la suis pas pendant l'effort."
    : "";
}

function thresholdSession(input: SuggestionInput): SuggestedSession {
  const target = sharedTarget(input, "intervals_threshold", 600, "Z4");
  return {
    type: "threshold",
    title: "Seuil : 3 × 10 min",
    durationMin: 60,
    structure: `15 min d'échauffement facile, 3 × 10 min au seuil avec 2 min de trot entre, 10 min de retour au calme.${pacingCue(target, 10)}`,
    target,
  };
}

function vo2Session(input: SuggestionInput): SuggestedSession {
  const target = sharedTarget(input, "intervals_vo2", 180, "Z5");
  return {
    type: "vo2max",
    title: "VO2max : 5 × 3 min",
    durationMin: 50,
    structure: `15 min d'échauffement avec 3 accélérations, 5 × 3 min avec 2 min de trot entre, 10 min de retour au calme.${pacingCue(target, 3)}`,
    target,
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

const WEEKDAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
/** Fenêtre d'observation de la semaine type (12 semaines, ou ce que l'historique fourni couvre). */
const HABIT_DAYS = 84;
/** On attend le jour habituel s'il tombe au plus 2 jours après le premier jour possible ; au-delà, pas d'attente. */
const MAX_WAIT_DAYS = 2;

type HabitCategory = "quality" | "long" | "any";

function habitCategory(type: SuggestionType): HabitCategory {
  if (type === "threshold" || type === "vo2max" || type === "specific") return "quality";
  if (type === "long") return "long";
  return "any";
}

/**
 * Semaine type : jours de la semaine où le coureur place d'habitude ce genre de
 * séance (au moins 3 fois et au moins 20 % de ses séances de ce genre sur la
 * période). Faute de 3 séances du genre, on regarde toutes ses sorties ; faute de
 * 3 sorties, pas de semaine type.
 */
export function habitualDays(runs: SuggestionRun[], today: string, category: HabitCategory): number[] {
  const start = addDays(today, -HABIT_DAYS);
  const inWindow = runs.filter((run) => run.localDate > start && run.localDate <= today);
  const matches = (run: SuggestionRun) => (category === "quality" ? HARD_FAMILIES.has(run.family) : category === "long" ? run.family === "long" : true);
  let dates = [...new Set(inWindow.filter(matches).map((run) => run.localDate))];
  if (dates.length < 3 && category !== "any") dates = [...new Set(inWindow.map((run) => run.localDate))];
  if (dates.length < 3) return [];
  const counts = new Array<number>(7).fill(0);
  for (const date of dates) counts[weekday(date)] += 1;
  return counts.flatMap((count, day) => (count >= 3 && count >= dates.length * 0.2 ? [day] : []));
}

function dayWord(date: string, today: string): string {
  const offset = daysBetween(today, date);
  if (offset <= 0) return "aujourd'hui";
  if (offset === 1) return "demain";
  return offset < 7 ? WEEKDAY_NAMES[weekday(date)] : formatDate(date, "long");
}

function windowLabel(dates: string[], today: string): string {
  if (dates.length === 1) return whenLabel(dates[0], today);
  const label = dates.map((date) => dayWord(date, today)).join(" ou ");
  return label.charAt(0).toUpperCase() + label.slice(1);
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

type Core = { primary: SuggestedSession; reason: string; reasonDetail?: string; when: string; dates: string[] };

/** Avec une semaine type, une sortie facile assez longue compte comme sortie longue (ses sorties du samedi, par ex.). */
function isLongRun(run: SuggestionRun, plan: WeekPlan | null): boolean {
  if (run.family === "long") return true;
  return plan != null && run.family === "easy" && (run.distanceM ?? 0) >= (plan.longRunKm - 2.5) * 1000;
}

function decide(input: SuggestionInput, labelToday: string): Core & { facts: Suggestion["facts"] } {
  const { today, runs, load, recovery } = input;
  const goal = input.goal ?? null;
  const lastRun = runs.at(-1) ?? null;
  const lastHard = [...runs].reverse().find(isHard) ?? null;
  const qualitySpacing = input.rhythm?.qualitySpacingDays ?? DEFAULT_QUALITY_SPACING_DAYS;
  const highLoadRatio = input.rhythm?.highLoadRatio ?? HIGH_LOAD_RATIO;
  const lastQuality = [...runs].reverse().find((run) => run.family === "intervals" || run.family === "steady") ?? null;
  const plan = input.weekPlan ?? null;
  const lastLong = [...runs].reverse().find((run) => isLongRun(run, plan)) ?? null;
  const since = (run: SuggestionRun | null) => (run ? daysBetween(run.localDate, today) : null);

  const daysSinceLastRun = since(lastRun);
  const daysSinceLastQuality = since(lastQuality);
  const daysSinceLastLong = since(lastLong);
  const highShare = load.intensity28d?.high ?? null;
  const weekStart = startOfIsoWeek(today);
  const constraint = input.weekConstraint && input.weekConstraint.weekStart === weekStart ? input.weekConstraint : null;
  const usualRunsPerWeek = plan?.runsPerWeek ?? goal?.runsPerWeek ?? Math.max(1, Math.round(load.runsPerWeek8w));
  const plannedRunsPerWeek = constraint?.runsThisWeek != null ? Math.max(1, Math.min(usualRunsPerWeek, constraint.runsThisWeek)) : usualRunsPerWeek;
  const qualityEveryDays = plan ? WEEKLY_QUALITY_DAYS : 8;
  const longEveryDays = plan ? 6 : 14;
  const longSession = (): SuggestedSession => (plan ? longRunSession(input, plan) : enduranceSession(input, roundTo5(Math.min(120, Math.max(70, longest8w * 1.1))), "Sortie longue", "long"));
  const longReason = (): string => {
    if (!plan) return daysSinceLastLong == null ? "Pas de sortie longue récente : c'est le meilleur levier d'endurance." : `Ta dernière sortie longue date de ${daysSinceLastLong} jours et la qualité est faite : allonge en restant en Z2.`;
    return plan.longRunStep
      ? `Pour le ${plan.race}, ton levier principal est ${plan.lever} : ta plus longue sortie est tenue, elle gagne 2 km (${plan.longRunKm} km), en Z2.`
      : `Pour le ${plan.race}, ton levier principal est ${plan.lever} : on consolide ta plus longue sortie (${plan.longRunKm} km) avant de l'allonger de 2 km.`;
  };
  // Après une séance dure, avec une semaine type à 3 sorties : footing court au plus tôt, la longue suit.
  let skipHabit = false;
  const daysToEvent = goal?.eventDate ? daysBetween(today, goal.eventDate) : null;

  const recent8w = runs.filter((run) => daysBetween(run.localDate, today) < 56);
  const easyDurations = present(recent8w.filter((run) => run.family === "easy").map((run) => run.movingTimeS));
  const typicalEasyMin = easyDurations.length ? (median(easyDurations) as number) / 60 : 45;
  // Durée de référence d'une sortie longue : les sorties longues ou faciles seulement. Une course ou un effort
  // longue menée comme une course (effet aérobie ≥ 4,5) n'est pas reproductible : 2 h de trail en course ne donnent pas 2 h de footing.
  // Vaut aussi pour un continu mené comme une course (semi en compétition classé « continu au seuil ») : seules les
  // sorties longues et faciles servent alors de repère, et un continu dur qui tient dans son format reste compté.
  const longest8w = Math.max(0, ...present(recent8w.filter((run) => !isRaceLikeEffort(run)).map((run) => run.movingTimeS))) / 60;
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
  let reasonDetail: string | undefined;

  if (daysToEvent === 0) {
    primary = { type: "race", title: "Jour de course", durationMin: 0, structure: "Échauffement de 15 min avec quelques accélérations, puis départ prudent les 2 premiers kilomètres.", target: goal?.targetPaceMps ? { zone: "allure objectif", heartRateLow: zoneRange(4, input.zones)[0], heartRateHigh: zoneRange(5, input.zones)[1], ...paceAround(goal.targetPaceMps, 2) } : null };
    reason = "C'est le jour J.";
  } else if (daysToEvent != null && daysToEvent > 0 && daysToEvent <= 6 && goal) {
    primary = taperSession(input, goal);
    reason = `Course dans ${daysToEvent} jour${daysToEvent > 1 ? "s" : ""} : on garde le rythme sans fatiguer.`;
  } else if (daysSinceLastRun == null || daysSinceLastRun >= 14) {
    primary = enduranceSession(input, 40, "Reprise en endurance");
    reason = daysSinceLastRun == null ? "Aucune course récente : on repart sur une base aérobie facile." : `Ta dernière course date de ${daysSinceLastRun} jours : on reprend en endurance avant de remettre de l'intensité.`;
  } else if (load.ratio != null && load.ratio >= highLoadRatio && (input.loadAlert == null || input.loadAlert.actionable)) {
    primary = enduranceSession(input, roundTo5(Math.min(50, typicalEasyMin)));
    // En langage de coureur : la semaine, et ce qui confirme qu'elle pèse ; les chiffres vont dans le détail.
    const reasons = input.loadAlert?.reasons ?? [];
    const signals = [
      reasons.some((entry) => entry.startsWith("VFC")) ? "ta VFC est basse" : null,
      reasons.some((entry) => entry.startsWith("FC de repos")) ? "ta FC de repos est haute" : null,
      reasons.some((entry) => entry.startsWith("nuit")) ? "tes nuits sont courtes" : null,
      reasons.some((entry) => entry.startsWith("effort perçu")) ? "ta dernière sortie t'a paru dure" : null,
    ].filter((entry): entry is string => entry != null);
    const also = signals.length ? `, et ${signals.length > 1 ? `${signals.slice(0, -1).join(", ")} et ${signals.at(-1)}` : signals[0]}` : "";
    reason = `Ta semaine a été nettement plus chargée que d'habitude${also} : on récupère avec une sortie facile.`;
    const typical = input.loadAlert?.typicalWeekLoad ?? null;
    reasonDetail = `Charge Garmin des 7 derniers jours : ${formatNumber(load.ratio, 1)} fois ta moyenne des 4 dernières semaines${typical != null ? ` (semaine habituelle sur 12 semaines : ${typical})` : ""}.`;
  } else if (lastHard && lastRun === lastHard && daysBetween(lastHard.localDate, today) < qualitySpacing && plan && plan.runsPerWeek >= 3) {
    primary = footingSession(input);
    skipHabit = true;
    reason = `Pour le ${plan.race}, ton levier principal est ${plan.lever} : ${plan.runsPerWeek} sorties par semaine. Après ${lowerFirst(lastHard.title ?? SESSION_KIND_LABELS[lastHard.kind])}, un footing court et facile ajoute une sortie sans fatiguer, si ton planning le permet ; la sortie longue suit.`;
  } else if (lastHard && lastRun === lastHard && daysBetween(lastHard.localDate, today) < qualitySpacing && plan && plannedRunsPerWeek <= 2 && (daysSinceLastLong == null || daysSinceLastLong >= longEveryDays)) {
    // Deux sorties par semaine : une de qualité, une longue. La qualité est faite : la facile qui suit est la longue,
    // sinon la sortie longue ne viendrait jamais (la qualité repasse devant à chaque fois).
    primary = longSession();
    reason = `Pour le ${plan.race}, avec ${plannedRunsPerWeek} sorties par semaine : une de qualité, une longue. La qualité est faite (${lowerFirst(lastHard.title ?? SESSION_KIND_LABELS[lastHard.kind])}) : c'est le tour de la sortie longue (${plan.longRunKm} km), en Z2.`;
  } else if (lastHard && lastRun === lastHard && daysBetween(lastHard.localDate, today) < qualitySpacing) {
    primary = enduranceSession(input, easyDuration);
    reason = `Ta dernière course (${lowerFirst(lastHard.title ?? SESSION_KIND_LABELS[lastHard.kind])}) était exigeante : la suivante reste facile pour que le travail paie.`;
  } else if (input.beginner) {
    // Débutant : une sortie ludique, puis une sortie un peu plus longue (10 min de plus que sa plus longue, 90 min au plus).
    const beginnerEasy = roundTo5(Math.min(45, Math.max(25, typicalEasyMin)));
    const lastWasLongest = lastRun != null && (lastRun.movingTimeS ?? 0) >= 0.9 * longest8w * 60;
    if (lastWasLongest || longest8w === 0) {
      primary = playfulSession(input, beginnerEasy, Math.floor(recent8w.length / 2));
      reason = "Pour progresser sans se mettre dans le rouge : un peu de vitesse en jouant, le reste en aisance. Le seuil et la VO2max viendront plus tard.";
    } else {
      const longer = roundTo5(Math.min(90, Math.max(30, longest8w + 10)));
      primary = enduranceSession(input, longer, "Sortie un peu plus longue", "long");
      reason = `Ta plus longue sortie récente dure ${Math.round(longest8w)} min : vise ${longer} min, tout en aisance. C'est ce qui construit l'endurance.`;
    }
  } else if (highShare != null && highShare >= 0.4 && lastRun && lastRun.family !== "easy") {
    primary = enduranceSession(input, easyDuration);
    reason = "Beaucoup d'intensité ces dernières semaines : une vraie sortie facile rééquilibre.";
    reasonDetail = `${formatNumber(highShare * 100)} % de ton temps des 4 dernières semaines en Z4–Z5.`;
  } else if (plannedRunsPerWeek <= 1 && lastRun && lastRun.family !== "intervals" && lastRun.family !== "steady") {
    ({ session: primary, why: reason } = qualitySession());
  } else if (plannedRunsPerWeek <= 1 && (daysSinceLastLong == null || daysSinceLastLong >= 14)) {
    primary = longSession();
    reason = "Une sortie par semaine : on alterne qualité et sortie longue, et c'est le tour de la longue.";
  } else if (daysSinceLastQuality == null || daysSinceLastQuality >= qualityEveryDays) {
    ({ session: primary, why: reason } = qualitySession());
  } else if (daysSinceLastLong == null || daysSinceLastLong >= longEveryDays) {
    primary = longSession();
    reason = longReason();
  } else {
    primary = enduranceSession(input, easyDuration);
    reason = "Qualité et sortie longue récentes déjà faites : une endurance facile entretient sans fatiguer.";
  }

  // Quand : 48 h après une séance dure ou longue, 24 h après une facile, 72 h (ou l'écart habituel du coureur, 48 h au moins) entre deux séances de qualité.
  let earliest = today;
  if (lastRun) {
    const gap = isHard(lastRun) || lastRun.family === "long" ? 2 : 1;
    const candidate = addDays(lastRun.localDate, gap);
    if (candidate > earliest) earliest = candidate;
  }
  if (kindOf(primary.type).hard && lastHard) {
    const candidate = addDays(lastHard.localDate, qualitySpacing);
    if (candidate > earliest) earliest = candidate;
  }
  // Récupération dégradée : une séance dure glisse d'un jour (le plan B reste proposé pour le jour même).
  if (kindOf(primary.type).hard && (recovery.state === "poor" || recovery.state === "watch")) earliest = addDays(earliest, 1);

  // Semaine type : jours préférés de l'objectif, sinon jours habituels pour ce genre de séance.
  const explicitDays = goal?.preferredDays ?? [];
  const days = explicitDays.length ? explicitDays : habitualDays(runs, today, habitCategory(primary.type));
  let start = earliest;
  if (primary.type !== "race" && !skipHabit) {
    const habitual = snapToPreferredDay(earliest, days);
    if (explicitDays.length || daysBetween(earliest, habitual) <= MAX_WAIT_DAYS) start = habitual;
  }
  if (constraint) {
    // Quota de sorties de la semaine atteint : la séance passe à la semaine suivante.
    const doneThisWeek = runs.filter((run) => run.localDate >= weekStart && run.localDate <= today).length;
    if (constraint.runsThisWeek != null && doneThisWeek >= constraint.runsThisWeek && start < addDays(weekStart, 7)) start = addDays(weekStart, 7);
    for (let guard = 0; guard < 7 && start < addDays(weekStart, 7) && constraint.unavailableDays.includes(weekday(start)); guard += 1) start = addDays(start, 1);
  }
  if (goal?.eventDate && start > goal.eventDate) start = goal.eventDate;

  // Fenêtre de 2 jours au plus : le jour conseillé et le lendemain, sauf jour imposé (course, jours préférés, veille de course).
  const second = addDays(start, 1);
  const secondOk = primary.type !== "race"
    && (!explicitDays.length || explicitDays.includes(weekday(second)))
    && (!goal?.eventDate || second < goal.eventDate)
    && !(constraint && second < addDays(weekStart, 7) && constraint.unavailableDays.includes(weekday(second)));
  const dates = secondOk ? [start, second] : [start];

  if (constraint) reason = `${reason} ${constraintSentence(constraint)}`;
  return {
    primary,
    reason,
    ...(reasonDetail ? { reasonDetail } : {}),
    when: start,
    dates,
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

/** Plans B et C de la séance recommandée : même rôle dans la semaine, bénéfice estimé. Pur. */
export function sessionOptions(primary: SuggestedSession, input: SuggestionInput): SessionOption[] {
  const minutes = primary.durationMin;
  const easy = easyTarget(input);
  const hrOnly = (target: SessionTarget | null): SessionTarget | null => (target ? { ...target, paceFastMps: null, paceSlowMps: null } : null);
  if (primary.type === "endurance" || primary.type === "recovery_run") {
    const bike = roundTo5(minutes * 1.4);
    return [
      { key: "velo", role: "aerobic", benefit: 0.7, running: false, type: primary.type, title: `Vélo ou elliptique : ${bike} min`, durationMin: bike, target: hrOnly(easy), structure: `${bike} min en continu dans la même plage de FC, cadence souple.`, note: "Garde l'aérobie et ménage les jambes ; ne compte pas comme une sortie de course." },
    ];
  }
  if (primary.type === "long") {
    const half = roundTo5(minutes / 2);
    return [
      { key: "long_split", role: "aerobic", benefit: 0.75, running: true, type: "long", title: `Longue en deux fois : 2 × ${half} min`, durationMin: half * 2, target: easy, structure: `${half} min le matin, ${half} min le soir, en Z2.`, note: "Même volume dans la journée, moins d'endurance sur la fin : utile quand le temps manque." },
    ];
  }
  if (primary.type === "threshold") {
    const tempo = sharedTarget(input, "intervals_tempo", 1500, "Z3–Z4");
    const threshold = primary.target;
    return [
      { key: "fartlek_seuil", role: "intensity", benefit: 0.85, running: true, type: "threshold", title: "Seuil court : 6 × 4 min", durationMin: 55, target: threshold, structure: `15 min d'échauffement, 6 × 4 min au seuil avec 1 min 30 de trot, 10 min de retour au calme.${pacingCue(threshold, 4)}`, note: "Même allure, répétitions plus courtes : plus facile à tenir, un peu moins de temps au seuil d'affilée." },
      { key: "tempo", role: "intensity", benefit: 0.8, running: true, type: "threshold", title: "Tempo continu : 25 min", durationMin: 50, target: tempo, structure: `15 min d'échauffement, 25 min d'un seul tenant à allure tempo, 10 min de retour au calme.${pacingCue(tempo, 25)}`, note: "D'un seul tenant à ton allure de course : moins de temps au seuil, plus de tenue sans récupération." },
    ];
  }
  if (primary.type === "vo2max") {
    const short = sharedTarget(input, "intervals_vo2", 60, "Z5");
    return [
      { key: "cotes", role: "intensity", benefit: 0.8, running: true, type: "vo2max", title: "Côtes : 8 × 1 min", durationMin: 45, target: hrOnly(primary.target), structure: "15 min d'échauffement, 8 × 1 min en côte (pente de 4 à 6 %) à effort soutenu, retour en trottinant, 10 min de retour au calme. En côte, c'est l'effort qui compte : la dernière doit être aussi bonne que la première.", note: "Même travail cardio, plus de force, moins d'impact sur les jambes." },
      { key: "fartlek_vo2", role: "intensity", benefit: 0.75, running: true, type: "vo2max", title: "Fartlek : 10 × 1 min / 1 min", durationMin: 45, target: short, structure: `15 min d'échauffement, 10 × 1 min vite et 1 min en trottinant, 10 min de retour au calme.${pacingCue(short, 1)}`, note: "Plus ludique et plus court par effort : un peu moins de temps près de la VO2max." },
    ];
  }
  return [];
}

export function suggestNextSession(input: SuggestionInput): Suggestion {
  const core = decide(input, input.today);
  const { primary } = core;
  const options = sessionOptions(primary, input);
  const chosen = input.chosenOption && options.some((option) => option.key === input.chosenOption) ? input.chosenOption : null;

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
    // Option choisie (plan B ou C) : la suite part de ce qui sera réellement fait. Sans course (vélo), rien n'est simulé.
    const picked = chosen ? options.find((option) => option.key === chosen) ?? null : null;
    const simulated: SuggestionRun[] = picked && !picked.running ? [] : [{ localDate: core.when, kind: picked?.key === "tempo" ? "tempo" : shape.kind, family: picked?.key === "tempo" ? "steady" : shape.family, movingTimeS: (picked?.durationMin ?? primary.durationMin) * 60, aerobicTrainingEffect: shape.hard ? 4.2 : 2.8, distanceM: primary.type === "long" && input.weekPlan && picked?.key !== "long_split" ? input.weekPlan.longRunKm * 1000 : null }];
    const neutralRecovery: RecoverySignals = { ...recovery, flags: [], state: "unknown" };
    // Rythme visé : pas plus de N séances par semaine. La séance d'après se décide au jour où elle peut avoir lieu
    // (au plus tôt après la fenêtre et l'écart du rythme), pas au jour de la prochaine : sinon une qualité due ce
    // jour-là était écartée comme trop proche de la précédente.
    const planned = core.facts.plannedRunsPerWeek;
    const spacing = Math.max(1, Math.round(7 / planned) - 1);
    const windowEnd = core.dates.at(-1) ?? core.when;
    const decideOn = [addDays(windowEnd, 1), addDays(core.when, spacing)].sort().at(-1) as string;
    const next = decide({ ...input, today: decideOn, runs: [...input.runs, ...simulated], load: { ...input.load, ratio: null }, loadAlert: null, recovery: neutralRecovery }, input.today);
    let date = next.when > windowEnd ? next.when : addDays(windowEnd, 1);
    if (daysBetween(core.when, date) < spacing) date = snapToPreferredDay(addDays(core.when, spacing), input.goal?.preferredDays ?? []);
    if (date <= windowEnd) date = addDays(windowEnd, 1);
    if (input.goal?.eventDate && date > input.goal.eventDate) date = input.goal.eventDate;
    then = { title: next.primary.title, durationMin: next.primary.durationMin, type: next.primary.type, when: { date, label: whenLabel(date, input.today) }, structure: next.primary.structure, target: next.primary.target, reason: next.reason };
  }

  return { primary, options, chosen, when: { date: core.when, label: windowLabel(core.dates, input.today), dates: core.dates }, reason: core.reason, ...(core.reasonDetail ? { reasonDetail: core.reasonDetail } : {}), alternative, then, facts: core.facts };
}
