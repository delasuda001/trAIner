import { formatClock, formatDate, formatPace } from "@/lib/formatters";
import { easyPaceRange, type EasySample } from "./easy-pace";
import type { HeartRateZones } from "@/lib/source/types";
import type { ActivityMetrics, SessionKind } from "./activity-metrics";
import { easyAboveZ2Share, paceSeconds } from "./activity-metrics";
import type { LoadAlert, LoadFigure } from "./load";
import { DEFAULT_QUALITY_SPACING_DAYS, spacingHours } from "./rhythm";
import { zoneOf, zoneRange } from "./zones";

/**
 * Consignes chiffrées d'une séance, 100 % déterministes : comment elle aurait
 * dû être menée, et quoi faire la prochaine fois sur le même type de séance.
 * Claude ne fait que choisir et formuler : toutes les cibles qu'il cite
 * viennent d'ici (le garde-fou rejette tout chiffre absent de la charge utile).
 *
 * Règles :
 * - une consigne principale dans « aurait dû », au plus une secondaire ;
 *   quand la charge ou l'enchaînement explique la séance, c'est le placement ;
 * - une correction n'est prescrite que sur un indicateur dégradé par rapport
 *   aux séances comparables (pas sur un écart dans sa norme) ;
 * - un écart marginal à la cible (≤ 3 s/km) ne donne lieu à aucun reproche.
 *
 * Allures de course « du moment » : fourchette entre l'estimation tirée du
 * seuil montre (ratios usuels) et celle tirée de ses répétitions longues
 * récentes (12 semaines). Ce sont des repères, pas des prédictions.
 */

export type RaceTarget = { distanceKm: number; targetTimeS: number };

const RACES = [
  { distanceKm: 5, ratio: 1.06, label: "5 km" },
  { distanceKm: 10, ratio: 1.025, label: "10 km" },
  { distanceKm: 21.0975, ratio: 0.975, label: "semi" },
  { distanceKm: 42.195, ratio: 0.92, label: "marathon" },
] as const;

/** Vitesse de course tenable ≈ vitesse au seuil × ratio (repères d'entraînement usuels). */
export const RACE_RATIO_FROM_THRESHOLD = Object.fromEntries(RACES.map((race) => [race.label, race.ratio]));
/** Exposant de Riegel : temps(d2) = temps(d1) × (d2/d1)^1,06. */
const RIEGEL_EXPONENT = 1.06;
/** Répétitions retenues comme référence 5 km : au moins 3 min chacune et 15 min d'effort au total. */
const EFFORT_MIN_REP_S = 180;
const EFFORT_MIN_TOTAL_S = 900;

/** Écart (s/km) entre l'allure visée et l'allure du moment. */
const REACHABLE_GAP_S = 3;
const STRETCH_GAP_S = 8;
/** Dégradation (s/km) entre premières et dernières répétitions, ou entre moitiés, jugée significative… */
const FADE_LIMIT_S = 5;
/** …et seulement si elle dépasse celle des comparables de cette marge. */
const FADE_ABOVE_REFERENCE_S = 3;
/** Au-delà de cet écart (s/km) avec la cible du format, la séance est sans doute d'un autre type : pas de consigne. */
const MISMATCH_LIMIT_S = 25;
/** Écart à la fourchette en deçà duquel on ne reproche rien (s/km). */
const MARGINAL_S = 3;
/** FC des répétitions plus haute que les comparables de cette valeur, pour un gain d'allure d'au plus GAIN_SMALL_S : coût cardiaque. */
const HR_COST_BPM = 4;
const GAIN_SMALL_S = 5;
/** Répétitions de moins de 60 s : l'allure de chacune est imprécise au GPS (accélération, latence) ; seules la moyenne et la tenue comptent. */
export const SHORT_REP_S = 60;
/** Perte en fin de série jugée significative pour des répétitions courtes (s/km), au-delà du bruit GPS. */
const SHORT_FADE_LIMIT_S = 10;
/** …et seulement si elle dépasse celle des comparables de 2 points de pourcentage. */
const FADE_PCT_ABOVE_REFERENCE = 2;
const MISMATCH_REASON = "allure trop éloignée de la cible du format reconnu, séance probablement d'un autre type";

export type PrescriptionTarget = {
  /** « allure 5 km du moment », « seuil », « endurance Z2 »… */
  label: string;
  /** Fourchette d'allure en s/km (rapide, lente), si elle est calculable. */
  paceFastS: number | null;
  paceSlowS: number | null;
  heartRateLow: number;
  heartRateHigh: number;
  zone: string;
};

/** Séance récente utile pour estimer l'allure de course (répétitions longues). */
export type RecentEffort = { localDate: string; kind: SessionKind; title: string; reps: number; repDurationS: number; workSpeedMps: number };

export type PaceEstimate = {
  race: string;
  distanceKm: number;
  fromThresholdS: number | null;
  fromEffortsS: number | null;
  fastS: number;
  slowS: number;
  centerS: number;
  /** Sur quoi repose l'estimation (texte court, chiffré). */
  basis: string;
};

export type GoalMarker = {
  race: string;
  goalTimeS: number;
  goalPaceS: number;
  estimate: PaceEstimate;
  realisticTimeS: number;
  /** > 0 : l'allure visée est plus rapide que l'allure du moment. */
  gapS: number;
  status: "reachable" | "stretch" | "out_of_reach";
};

export type Prescription =
  | { status: "none"; reason: string }
  | {
      status: "ok";
      target: PrescriptionTarget;
      goal: GoalMarker | null;
      /** Comment la séance aurait dû être menée : la consigne principale, puis au plus une secondaire. Vide si rien à corriger. */
      shouldHave: string[];
      /** À reproduire : ce qui était dans la cible. */
      keep: string | null;
      /** La prochaine séance du même type. */
      next: { format: string; target: PrescriptionTarget; recoveryS: number | null; cue: string };
    };

/** Repères des séances comparables (déjà calculés par le moteur de comparaison). */
export type ComparableReference = { repSpeedMps: number | null; repHeartRateBpm: number | null; repSpreadSPerKm: number | null; halvesFadeSPerKm: number | null; /** Perte (%) premier tiers → dernier tiers des répétitions sur les comparables du même format. */ repFadePct?: number | null };

export type PrescriptionInput = {
  metrics: ActivityMetrics;
  zones: HeartRateZones;
  lactateThresholdSpeedMps: number | null;
  /** D'où vient le seuil retenu, pour les phrases (« seuil montre » par défaut, « seuil observé » sinon). */
  thresholdLabel?: string;
  restingHeartRateBpm: number;
  /** Vitesse par battement au-dessus du repos des sorties faciles récentes (traduit une FC cible en allure). */
  recentSpeedPerBeat: number | null;
  /** Footings des 12 semaines précédentes (allure, FC) : bornent l'allure facile à ce qui a été couru (voir easy-pace.ts). */
  easySamples?: EasySample[];
  movingTimeS: number | null;
  raceTargets: RaceTarget[];
  /** Répétitions longues des 12 semaines précédant la séance. */
  efforts: RecentEffort[];
  reference: ComparableReference | null;
  /** `loadAlert` : charge des 7 jours AVANT la séance, corroborée ou non (voir load.ts). */
  context: {
    loadAlert: LoadAlert | null;
    /** Charge 7 jours avant la séance, sa référence et leur rapport (cités ensemble). */
    loadFigure?: LoadFigure | null;
    qualityBefore: Array<{ title: string; daysBefore: number }>;
    /** Signaux de récupération dégradés le jour de la séance. */
    recoveryFlags?: string[];
    /** Niveau du verdict : une séance réussie avec une récupération normale ne reçoit pas de reproche de placement. */
    verdictLevel?: string;
    /** Écart habituel minimal entre deux séances de qualité (jours), cf. engine/rhythm ; 3 par défaut. */
    qualitySpacingDays?: number;
  } | null;
};

type PaceInputs = Pick<PrescriptionInput, "zones" | "lactateThresholdSpeedMps" | "thresholdLabel" | "raceTargets" | "efforts">;
type EstimateInputs = Pick<PrescriptionInput, "lactateThresholdSpeedMps" | "thresholdLabel" | "efforts">;

function pace(seconds: number): string {
  return formatPace(1000 / seconds);
}

function paceRange(fastS: number, slowS: number): string {
  return fastS === slowS ? pace(fastS) : `${pace(fastS).replace("/km", "")}–${pace(slowS)}`;
}

function band(target: PrescriptionTarget): string {
  if (target.paceFastS == null || target.paceSlowS == null) return `${target.heartRateLow}–${target.heartRateHigh} bpm`;
  return paceRange(target.paceFastS, target.paceSlowS);
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function decimal(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

function raceOf(distanceKm: number) {
  return RACES.find((race) => Math.abs(race.distanceKm - distanceKm) < 0.05) ?? null;
}

/** Allure 5 km tirée des répétitions longues récentes : moyenne des deux meilleures séances. */
function effortsPace5kS(efforts: RecentEffort[]): { paceS: number; best: RecentEffort } | null {
  const usable = efforts
    .filter((effort) => effort.repDurationS >= EFFORT_MIN_REP_S && effort.reps * effort.repDurationS >= EFFORT_MIN_TOTAL_S)
    .sort((a, b) => b.workSpeedMps - a.workSpeedMps);
  if (!usable.length) return null;
  const top = usable.slice(0, 2);
  return { paceS: Math.round(top.reduce((sum, effort) => sum + paceSeconds(effort.workSpeedMps), 0) / top.length), best: top[0] };
}

/** Allure de course du moment : fourchette entre seuil montre et répétitions récentes. */
export function raceEstimate(distanceKm: number, input: EstimateInputs): PaceEstimate | null {
  const race = raceOf(distanceKm);
  if (!race) return null;
  const lt = input.lactateThresholdSpeedMps;
  const fromThresholdS = lt ? paceSeconds(lt * race.ratio) : null;
  const efforts = effortsPace5kS(input.efforts);
  const fromEffortsS = efforts ? Math.round(efforts.paceS * Math.pow(distanceKm / 5, RIEGEL_EXPONENT - 1)) : null;
  const values = [fromThresholdS, fromEffortsS].filter((value): value is number => value != null);
  if (!values.length) return null;
  const basis = [
    fromThresholdS != null && lt ? `${input.thresholdLabel ?? "seuil montre"} ${pace(paceSeconds(lt))}` : null,
    efforts ? `${efforts.best.title} du ${formatDate(efforts.best.localDate, "short")} à ${pace(paceSeconds(efforts.best.workSpeedMps))}` : null,
  ].filter(Boolean).join(" et ");
  const fastS = Math.min(...values);
  const slowS = Math.max(...values);
  return { race: race.label, distanceKm, fromThresholdS, fromEffortsS, fastS, slowS, centerS: Math.round((fastS + slowS) / 2), basis };
}

export function goalMarker(targets: RaceTarget[], distanceKm: number, input: EstimateInputs): GoalMarker | null {
  const target = targets.find((entry) => Math.abs(entry.distanceKm - distanceKm) < 0.05);
  const estimate = raceEstimate(distanceKm, input);
  if (!target || !estimate) return null;
  const goalPaceS = Math.round(target.targetTimeS / target.distanceKm);
  const gapS = estimate.centerS - goalPaceS;
  return {
    race: estimate.race,
    goalTimeS: target.targetTimeS,
    goalPaceS,
    estimate,
    realisticTimeS: Math.round(estimate.centerS * target.distanceKm),
    gapS,
    status: gapS <= REACHABLE_GAP_S ? "reachable" : gapS <= STRETCH_GAP_S ? "stretch" : "out_of_reach",
  };
}

/** Repère du moment, pour une séance : sans jugement sur l'objectif (dit une seule fois, sur la page Objectif). */
export function paceReferenceSentence(marker: GoalMarker): string {
  return `Repère ${marker.estimate.race} du moment : ${paceRange(marker.estimate.fastS, marker.estimate.slowS)} (${marker.estimate.basis}).`;
}

export type GoalStatus = {
  race: string;
  goal: string;
  current: string;
  verdict: string;
  /** Rythme de progression nécessaire si une date est fixée. */
  timing: string;
  status: GoalMarker["status"];
};

/** Situation d'un objectif chiffré : écart, repère actuel, temps restant et ce qu'il faudrait gagner. */
export function goalStatus(marker: GoalMarker, eventDate: string | null, daysLeft: number | null): GoalStatus {
  const verdict = marker.status === "reachable"
    ? "À portée : travaille à l'allure visée."
    : marker.status === "stretch"
      ? `Ambitieux mais crédible : ${marker.gapS} s/km à gagner.`
      : `Pas encore à portée : ${marker.gapS} s/km à gagner.`;
  let timing = "Pas de date fixée : l'écart se suit séance après séance.";
  if (eventDate && daysLeft != null && daysLeft > 0 && marker.gapS > 0) {
    const months = daysLeft / 30.4;
    timing = `Course dans ${Math.round(daysLeft / 7)} semaines : environ ${decimal(marker.gapS / Math.max(months, 0.25))} s/km à gagner par mois.`;
  } else if (eventDate && daysLeft != null && daysLeft > 0) {
    timing = `Course dans ${Math.round(daysLeft / 7)} semaines : garde le cap.`;
  }
  return {
    race: marker.race,
    goal: `${formatClock(marker.goalTimeS)} (${pace(marker.goalPaceS)})`,
    current: `${paceRange(marker.estimate.fastS, marker.estimate.slowS)}, soit environ ${formatClock(marker.realisticTimeS)} (${marker.estimate.basis})`,
    verdict,
    timing,
    status: marker.status,
  };
}

type Plan = { target: PrescriptionTarget; goal: GoalMarker | null; recoveryS: number | null; maxReps: number };

/** Allure d'entraînement visée : l'objectif s'il est à portée, sinon l'allure du moment. */
function raceAimS(marker: GoalMarker | null, estimate: PaceEstimate | null): number | null {
  if (marker && marker.status !== "out_of_reach") return marker.goalPaceS;
  return estimate?.centerS ?? null;
}

function raceLabel(marker: GoalMarker | null, race: string): string {
  return marker && marker.status !== "out_of_reach" ? `allure ${race} visée` : `allure ${race} du moment`;
}

function hr(zone: 1 | 2 | 3 | 4 | 5, zones: HeartRateZones): [number, number] {
  return zoneRange(zone, zones);
}

/** FC d'un travail au seuil : autour de la FC seuil de la montre (−5 à +2 bpm) ; à défaut, la Z4. */
function thresholdHeartRate(zones: HeartRateZones): { heartRateLow: number; heartRateHigh: number; zone: string } {
  const lthr = zones.lactateThresholdHeartRateBpm;
  if (lthr == null) {
    const [low, high] = hr(4, zones);
    return { heartRateLow: low, heartRateHigh: high, zone: "Z4" };
  }
  const low = lthr - 5;
  const high = lthr + 2;
  const zoneLow = Math.max(1, zoneOf(low, zones));
  const zoneHigh = Math.max(1, zoneOf(high, zones));
  return { heartRateLow: low, heartRateHigh: high, zone: zoneLow === zoneHigh ? `Z${zoneLow}` : `Z${zoneLow}–Z${zoneHigh}` };
}

/**
 * Tempo : allure de la course visée (10 km si tous les objectifs chiffrés sont de 10 km au plus, sinon semi),
 * FC resserrée sur une dizaine de bpm : sous la FC seuil de la montre (semi : −10 à −1, 10 km : −6 à +3) ;
 * sans FC seuil, autour du début de la Z4 (semi : −7 à +3, 10 km : −3 à +7).
 */
function tempoTarget(input: PaceInputs): { target: PrescriptionTarget; goal: GoalMarker | null } {
  const tenK = input.raceTargets.length > 0 && input.raceTargets.every((target) => target.distanceKm <= 10.5);
  const race = tenK ? { km: 10, name: "10 km" } : { km: 21.0975, name: "semi" };
  const marker = goalMarker(input.raceTargets, race.km, input);
  const zones = input.zones;
  const lthr = zones.lactateThresholdHeartRateBpm;
  const z4 = zones.floors[3];
  const [low, high] = lthr != null ? (tenK ? [lthr - 6, lthr + 3] : [lthr - 10, lthr - 1]) : tenK ? [z4 - 3, z4 + 7] : [z4 - 7, z4 + 3];
  const zoneLow = Math.max(1, zoneOf(low, zones));
  const zoneHigh = Math.max(1, zoneOf(high, zones));
  return {
    target: { label: raceLabel(marker, race.name), ...around(raceAimS(marker, raceEstimate(race.km, input)), 4), heartRateLow: low, heartRateHigh: high, zone: zoneLow === zoneHigh ? `Z${zoneLow}` : `Z${zoneLow}–Z${zoneHigh}` },
    goal: marker,
  };
}

function around(centerS: number | null, half: number): { paceFastS: number | null; paceSlowS: number | null } {
  return centerS == null ? { paceFastS: null, paceSlowS: null } : { paceFastS: centerS - half, paceSlowS: centerS + half };
}

/** Cible d'un format de fractionné (partagée avec la suggestion de prochaine séance). */
export function intervalTarget(kind: SessionKind, repDurationS: number, input: PaceInputs): PrescriptionTarget | null {
  return intervalPlan(kind, repDurationS, input)?.target ?? null;
}

function intervalPlan(kind: SessionKind, repDurationS: number, input: PaceInputs): Plan | null {
  const lt = input.lactateThresholdSpeedMps;
  const zones = input.zones;
  const ltS = lt ? paceSeconds(lt) : null;
  if (kind === "intervals_short") {
    const [low] = hr(4, zones);
    // Format court et dense (30/30, 40/40) : allure VMA (≈ 1 000 m, seuil × 1,18) au lieu du 1 500 m (× 1,14),
    // récupération égale à l'effort, jusqu'à 20 répétitions.
    const dense = repDurationS <= 45;
    const center = lt ? paceSeconds(lt * (dense ? 1.18 : 1.14)) : null;
    return { target: { label: dense ? "VMA (allure 1 000 m)" : "vitesse (allure 1 500 m)", ...around(center, 3), heartRateLow: low, heartRateHigh: hr(5, zones)[1], zone: "Z4–Z5" }, goal: null, recoveryS: dense ? roundTo(Math.max(15, repDurationS), 15) : roundTo(Math.min(120, Math.max(60, repDurationS)), 15), maxReps: dense ? 20 : 12 };
  }
  if (kind === "intervals_vo2") {
    const marker = goalMarker(input.raceTargets, 5, input);
    const [low] = hr(5, zones);
    const high = zones.maxHeartRateBpm ? Math.round(low + (zones.maxHeartRateBpm - low) * 0.6) : low + 8;
    // Répétitions courtes (< 3 min) : allure 3 km ; plus longues : allure 5 km.
    if (repDurationS < 180) return { target: { label: "allure 3 km", ...around(lt ? paceSeconds(lt * 1.09) : null, 3), heartRateLow: low, heartRateHigh: high, zone: "Z5" }, goal: null, recoveryS: roundTo(Math.max(90, repDurationS * 0.6), 15), maxReps: 10 };
    const center = raceAimS(marker, raceEstimate(5, input));
    return { target: { label: raceLabel(marker, "5 km"), ...around(center, 3), heartRateLow: low, heartRateHigh: high, zone: "Z5" }, goal: marker, recoveryS: roundTo(Math.min(180, Math.max(90, repDurationS * 0.4)), 15), maxReps: repDurationS >= 240 ? 6 : 10 };
  }
  if (kind === "intervals_threshold") {
    return { target: { label: "seuil", paceFastS: ltS != null ? ltS - 3 : null, paceSlowS: ltS != null ? ltS + 4 : null, ...thresholdHeartRate(zones) }, goal: goalMarker(input.raceTargets, 21.0975, input), recoveryS: roundTo(Math.min(120, Math.max(60, repDurationS * 0.2)), 15), maxReps: 6 };
  }
  if (kind === "intervals_tempo") return { ...tempoTarget(input), recoveryS: 60, maxReps: 5 };
  return null;
}

function continuousPlan(kind: SessionKind, input: PrescriptionInput): Plan | null {
  const lt = input.lactateThresholdSpeedMps;
  const zones = input.zones;
  if (kind === "threshold") {
    const ltS = lt ? paceSeconds(lt) : null;
    return { target: { label: "seuil", paceFastS: ltS != null ? ltS - 3 : null, paceSlowS: ltS != null ? ltS + 4 : null, ...thresholdHeartRate(zones) }, goal: goalMarker(input.raceTargets, 21.0975, input), recoveryS: null, maxReps: 1 };
  }
  if (kind === "tempo") return { ...tempoTarget(input), recoveryS: null, maxReps: 1 };
  // Endurance, récupération, sortie longue : FC en Z2 (Z1–Z2 en récupération), allure traduite de la FC.
  const [z2Low, z2High] = hr(2, zones);
  const low = kind === "recovery" ? zones.floors[0] : z2Low;
  const high = kind === "recovery" ? z2Low + 5 : z2High;
  const perBeat = input.recentSpeedPerBeat ?? input.metrics.aerobic?.speedPerBeat ?? null;
  const toPace = (heartRate: number) => (perBeat ? paceSeconds(perBeat * (heartRate - input.restingHeartRateBpm)) : null);
  const fast = toPace(high - 3);
  const slow = toPace(Math.max(low, high - 9));
  // Récupération : volontairement plus lente que les footings, pas de borne.
  const anchored = kind !== "recovery" ? easyPaceRange(fast != null && slow != null ? { fastS: fast, slowS: slow } : null, { heartRateLow: Math.max(low, high - 12), heartRateHigh: high }, input.easySamples) : null;
  return { target: { label: kind === "recovery" ? "récupération" : "endurance Z2", paceFastS: anchored?.fastS ?? fast, paceSlowS: anchored?.slowS ?? slow, heartRateLow: low, heartRateHigh: high, zone: kind === "recovery" ? "Z1–Z2" : "Z2" }, goal: null, recoveryS: null, maxReps: 1 };
}

/** « 3 × 2 km », « 6 × 800 m », « 8 × 70 s ». */
function repFormat(distanceM: number | null, durationS: number): string {
  if (distanceM && distanceM >= 950) return `${String(Math.round(distanceM / 100) / 10).replace(".", ",")} km`;
  if (distanceM && distanceM >= 400) return `${Math.round(distanceM / 50) * 50} m`;
  return durationS < 90 ? `${Math.round(durationS / 5) * 5} s` : formatClock(roundTo(durationS, 15));
}

/** Placement dans la semaine : le levier principal quand la charge ou l'enchaînement explique la séance. */
function placementLine(input: PrescriptionInput): string | null {
  const context = input.context;
  if (!context) return null;
  // Séance réussie et récupération normale : pas de reproche de placement (la prudence vaut pour les jours suivants).
  if (context.verdictLevel === "above" && !(context.recoveryFlags ?? []).length) return null;
  // Le ratio seul ne suffit pas (1 à 2 sorties par semaine) : il faut un signal qui le corrobore.
  const alert = context.loadAlert;
  if (alert?.actionable && alert.ratio != null) {
    const figure = context.loadFigure;
    const load = figure?.ratio != null ? `charge 7 jours déjà à ${figure.value}, soit ${decimal(figure.ratio)} fois ta moyenne des 4 semaines précédentes (${figure.reference})` : `charge 7 jours déjà à ${decimal(alert.ratio)} fois ta moyenne`;
    return `Placement : ${load}, avec ${alert.reasons.join(", ")} ; reporte de 1 à 2 jours ou remplace par une endurance facile.`;
  }
  // Écart minimal adapté à l'habitude du coureur (72 h par défaut, 48 h s'il enchaîne ainsi d'ordinaire).
  const spacing = context.qualitySpacingDays ?? DEFAULT_QUALITY_SPACING_DAYS;
  const close = context.qualityBefore.find((entry) => entry.daysBefore < spacing);
  if (close) return `Placement : ${close.title} seulement ${close.daysBefore} jour${close.daysBefore > 1 ? "s" : ""} avant ; laisse ${spacingHours(spacing)} entre deux séances de qualité.`;
  return null;
}

/** Une consigne principale, au plus une secondaire. */
function prioritize(placement: string | null, execution: string[]): string[] {
  return [placement, ...execution].filter((line): line is string => line != null).slice(0, 2);
}

function intervalPrescription(input: PrescriptionInput): Prescription {
  const { metrics, reference } = input;
  const work = metrics.work;
  if (!work || work.reps < 2) return { status: "none", reason: "répétitions non reconnues" };
  const plan = intervalPlan(metrics.kind, work.averageDurationS, input);
  if (!plan) return { status: "none", reason: "type de fractionné non pris en charge" };
  const { target } = plan;
  const hasPace = target.paceFastS != null && target.paceSlowS != null;
  const fast = target.paceFastS ?? 0;
  const slow = target.paceSlowS ?? 0;
  const averageS = paceSeconds(work.averageSpeedMps);
  if (hasPace && (averageS > slow + MISMATCH_LIMIT_S || averageS < fast - MISMATCH_LIMIT_S)) return { status: "none", reason: MISMATCH_REASON };

  const reps = work.repsDetail.map((rep) => paceSeconds(rep.speedMps));
  const first = reps[0];
  const last = reps[reps.length - 1];
  const fade = work.fadeSPerKm ?? 0;
  const repHr = work.averageHeartRateBpm != null ? Math.round(work.averageHeartRateBpm) : null;
  const recovery = work.averageRecoveryS != null ? Math.round(work.averageRecoveryS) : null;
  const shortRecovery = plan.recoveryS != null && recovery != null && recovery < plan.recoveryS - 15;
  // Dégradation réelle seulement si elle dépasse celle de ses comparables.
  // Régularité : écart entre la répétition la plus rapide et la plus lente, comparé au MÊME indicateur des comparables.
  const referenceSpread = reference?.repSpreadSPerKm ?? null;
  const spread = work.paceSpreadSPerKm;
  const shortReps = work.averageDurationS < SHORT_REP_S;
  // Répétitions courtes : perte au-delà du bruit GPS ET au-delà de la perte habituelle sur ses comparables du même format.
  const referenceFadePct = reference?.repFadePct ?? null;
  const fadeDegraded = shortReps
    ? fade >= SHORT_FADE_LIMIT_S && (referenceFadePct == null || work.fadePct == null || work.fadePct >= referenceFadePct + FADE_PCT_ABOVE_REFERENCE)
    : fade >= FADE_LIMIT_S && (referenceSpread == null || spread == null || spread >= referenceSpread + FADE_ABOVE_REFERENCE_S);
  // Coût cardiaque : FC nettement plus haute que les comparables pour une allure à peine meilleure.
  const refHr = reference?.repHeartRateBpm != null ? Math.round(reference.repHeartRateBpm) : null;
  const refPaceS = reference?.repSpeedMps ? paceSeconds(reference.repSpeedMps) : null;
  const aboveTargetHr = repHr != null && repHr > target.heartRateHigh && (metrics.kind === "intervals_threshold" || metrics.kind === "intervals_tempo");
  // FC au-dessus du format : une seule consigne d'intensité (celle de la FC cible), pas deux.
  const hrCost = !aboveTargetHr && repHr != null && refHr != null && refPaceS != null && repHr >= refHr + HR_COST_BPM && refPaceS - averageS <= GAIN_SMALL_S;
  const tooSlow = hasPace && averageS > slow + MARGINAL_S;
  // Trop vite : la moyenne, ou au moins la moitié des répétitions, sous la fourchette (au-delà de l'écart marginal).
  const fastReps = hasPace && !shortReps ? reps.filter((value) => value < fast - MARGINAL_S) : [];
  const tooFast = hasPace && (averageS < fast - MARGINAL_S || fastReps.length * 2 >= reps.length);

  const execution: string[] = [];
  if (fadeDegraded && shortReps) {
    execution.push(`Gestion : tes dernières répétitions perdent ${fade} s/km ; vise ${band(target)} en moyenne sur toute la série, sans chercher plus vite au début.`);
  } else if (fadeDegraded) {
    if (hasPace && first < fast) execution.push(`Départ : 1re répétition à ${pace(first)} pour une cible ${band(target)} ; partir à ${pace(slow)} évite de finir à ${pace(last)}.`);
    else if (shortRecovery) execution.push(`Récupération : ${formatClock(plan.recoveryS)} entre les répétitions au lieu de ${formatClock(recovery)}, pour ne plus perdre ${fade} s/km sur la dernière.`);
    else execution.push(`Gestion : pars à ${hasPace ? pace(slow) : "l'allure de ta dernière répétition"} dès la 1re pour ne plus perdre ${fade} s/km en fin de séance.`);
  }
  if (hrCost) execution.push(`Intensité : tiens ${band(target)} sans chercher plus vite ; FC des répétitions à ${repHr} bpm contre ${refHr} bpm sur tes comparables ${(refPaceS as number) - averageS > 0 ? `pour ${(refPaceS as number) - averageS} s/km de mieux seulement` : "pour une allure qui n'est pas meilleure"}.`);
  else if (tooFast && !fadeDegraded) {
    execution.push(fastReps.length && fastReps.length < reps.length
      ? `Allure : reste dans ${band(target)} sur chaque répétition ; ${fastReps.length} sur ${reps.length} étaient plus rapides (${paceRange(Math.min(...fastReps), Math.max(...fastReps))}), au-dessus de l'intensité visée.`
      : `Allure : reste dans ${band(target)} ; ${pace(averageS)} t'a fait travailler au-dessus de l'intensité visée.`);
  }
  if (aboveTargetHr) execution.push(`Intensité : repasse sous ${target.heartRateHigh} bpm (${target.zone}) ; ${repHr} bpm, c'est déjà plus que ce format.`);
  const placement = placementLine(input);
  // Une allure trop lente expliquée par la charge relève du placement, pas de l'exécution.
  if (tooSlow && !fadeDegraded && !placement) execution.push(`Allure : vise ${band(target)} dès la 1re répétition ; ${pace(averageS)}, c'est sous l'intensité du format.`);
  const shouldHave = prioritize(placement, execution);

  // Sans allure cible (ni seuil ni objectif chiffré) : la cible est la FC des répétitions.
  const hrOnTarget = !hasPace && repHr != null && repHr >= target.heartRateLow && repHr <= target.heartRateHigh;
  const onTarget = (hasPace || hrOnTarget) && !tooFast && !tooSlow && !fadeDegraded && !hrCost;
  const strictlyOnTarget = onTarget && (hrOnTarget || (averageS >= fast && averageS <= slow));
  // Repère d'allure quand la cible n'est qu'une FC : l'allure de cette séance, tenue dans la cible.
  const paceHint = hasPace ? "" : ` (repère d'allure : ${pace(averageS)}, celle de cette séance)`;
  const keep = strictlyOnTarget
    ? `Répétitions à ${pace(averageS)}${shortReps ? " en moyenne" : ""}${hrOnTarget ? ` et ${repHr} bpm,` : ""} dans la cible ${band(target)}${spread != null && !shortReps ? `, ${spread} s/km entre la plus rapide et la plus lente` : ""} : à reproduire.`
    : shortReps ? (hasPace && averageS >= fast && averageS <= slow ? `Allure moyenne des répétitions à ${pace(averageS)}, dans la cible ${band(target)} : à reproduire.` : null)
    : !fadeDegraded && spread != null ? `Régularité : ${spread} s/km entre la répétition la plus rapide et la plus lente${referenceSpread != null ? `, ${spread < referenceSpread - 2 ? "mieux que" : "comme"} tes comparables (${referenceSpread} s/km)` : ""}.` : null;

  const format = `${work.reps} × ${repFormat(work.averageDistanceM, work.averageDurationS)}`;
  const recoveryText = formatClock(plan.recoveryS ?? recovery);
  let nextFormat = format;
  let nextTarget = target;
  let cue: string;
  if (placement) {
    cue = `Même format ${format} à ${band(target)}, récupération ${recoveryText}, sur une semaine sans pic de charge et à ${spacingHours(input.context?.qualitySpacingDays ?? DEFAULT_QUALITY_SPACING_DAYS)} au moins d'une autre séance de qualité.`;
  } else if (hrCost) {
    cue = `Même format ${format} à ${band(target)}, en visant ${refHr} bpm sur les répétitions plutôt que la vitesse.`;
  } else if (!strictlyOnTarget && shortReps) {
    cue = `Même format ${format} à ${band(target)} en moyenne, récupération ${recoveryText} ; sur moins de ${SHORT_REP_S} s, l'allure d'une répétition au GPS n'est pas fiable : règle-toi sur l'effort et la moyenne.`;
  } else if (!strictlyOnTarget) {
    // Sans allure cible, pas de consigne de départ en bpm (la FC monte pendant la répétition).
    cue = hasPace ? `Même format ${format} à ${band(target)}, récupération ${recoveryText} ; 1re répétition à ${pace(slow)}, pas plus vite.` : `Même format ${format} à ${band(target)}, récupération ${recoveryText}.`;
  } else if (plan.goal && plan.goal.status !== "out_of_reach" && fast > plan.goal.goalPaceS) {
    nextTarget = { ...target, paceFastS: fast - 3, paceSlowS: slow - 3 };
    cue = `Même format ${format}, 3 s/km plus vite : ${band(nextTarget)}, récupération ${recoveryText}.`;
  } else if (work.reps < plan.maxReps) {
    nextFormat = format.replace(/^\d+/, String(work.reps + 1));
    cue = `Une répétition de plus : ${nextFormat} à ${band(target)}${paceHint}, récupération ${recoveryText}.`;
  } else {
    cue = `Même format ${format} à ${band(target)}${paceHint} : le volume est au maximum utile, garde la qualité.`;
  }
  return { status: "ok", target, goal: plan.goal, shouldHave, keep, next: { format: nextFormat, target: nextTarget, recoveryS: plan.recoveryS, cue } };
}

/** Sortie longue en Z4 ou plus pendant au moins ce temps : effort long volontaire (course), pas une endurance ratée. */
const HARD_LONG_MIN_S = 60 * 60;

export function prescribe(input: PrescriptionInput): Prescription {
  const { metrics } = input;
  if (metrics.family === "intervals") return intervalPrescription(input);

  const plan = continuousPlan(metrics.kind, input);
  if (!plan) return { status: "none", reason: "type de séance non pris en charge" };
  const { target } = plan;
  const mainHr = metrics.mainHeartRateBpm != null ? Math.round(metrics.mainHeartRateBpm) : null;
  const mainS = metrics.mainSpeedMps ? paceSeconds(metrics.mainSpeedMps) : null;
  const halves = metrics.halves;
  const hasPace = target.paceFastS != null && target.paceSlowS != null;
  const minutes = input.movingTimeS ? Math.max(5, roundTo(input.movingTimeS / 60, 5)) : null;

  // Sortie longue menée en Z4 ou plus (course, effort long volontaire) : ce n'était pas de l'endurance ratée.
  // Pas de reproche d'intensité, pas de « même effort plus long » : récupérer avant la prochaine qualité.
  if (metrics.family === "long" && mainHr != null && mainHr >= input.zones.floors[3] && (input.movingTimeS ?? 0) >= HARD_LONG_MIN_S) {
    const [easyLow, easyHigh] = hr(2, input.zones);
    const steady = halves == null || halves.fadeSPerKm <= FADE_LIMIT_S;
    const keep = steady && mainS != null ? `Effort long soutenu : ${minutes} min à ${pace(mainS)} pour ${mainHr} bpm, sans perte en 2e moitié.` : null;
    const cue = `Après un effort de cette durée, 2 à 3 jours de footing facile entre ${easyLow} et ${easyHigh} bpm avant la prochaine séance de qualité.`;
    return { status: "ok", target, goal: null, shouldHave: [], keep, next: { format: "footing facile", target, recoveryS: null, cue } };
  }

  if (metrics.family === "easy" || metrics.family === "long") {
    const execution: string[] = [];
    if (mainHr != null && mainHr > target.heartRateHigh) execution.push(`Intensité : reste sous ${target.heartRateHigh} bpm (haut de ${target.zone})${hasPace ? `, soit ${band(target)}` : ""} ; ${mainHr} bpm de moyenne, ce n'est plus de l'endurance.`);
    // FC moyenne en Z2 mais une part notable du temps au-dessus : ralentir pour y rester.
    const aboveZ2 = mainHr != null && mainHr <= target.heartRateHigh ? easyAboveZ2Share(metrics) : null;
    // Une allure n'est citée pour ralentir que si elle est plus lente que celle courue (sinon la consigne se contredit).
    const slowerHint = hasPace && mainS != null && (target.paceSlowS as number) > mainS;
    if (aboveZ2 != null) execution.push(`Intensité : ${Math.round(aboveZ2 * 100)} % du temps au-dessus de ${target.heartRateHigh} bpm (haut de ${target.zone}) ; ralentis dès que tu le dépasses${slowerHint ? `, quitte à courir à ${pace(target.paceSlowS as number)}` : ""}.`);
    const firstHalfS = halves ? paceSeconds(halves.first.speedMps) : null;
    if (halves?.driftPct != null && halves.driftPct > 5) execution.push(`Départ : ${hasPace && firstHalfS != null && (target.paceSlowS as number) > firstHalfS ? `pars à ${pace(target.paceSlowS as number)}` : "pars plus lentement"} sur les 15 premières minutes pour limiter la dérive cardiaque (${decimal(halves.driftPct)} %).`);
    const inTarget = mainHr != null && mainHr >= target.heartRateLow && mainHr <= target.heartRateHigh;
    const keep = aboveZ2 != null || mainHr == null || mainHr > target.heartRateHigh
      ? null
      : inTarget
        ? `FC moyenne à ${mainHr} bpm, dans la cible ${target.heartRateLow}–${target.heartRateHigh} bpm : à reproduire.`
        : `FC moyenne à ${mainHr} bpm, sous la cible ${target.heartRateLow}–${target.heartRateHigh} bpm : sortie très facile, rien à corriger.`;
    const nextMinutes = metrics.family === "long" && minutes ? Math.min(120, roundTo(minutes * 1.1, 5)) : minutes;
    const format = nextMinutes ? `${nextMinutes} min` : "même durée";
    const cue = `${metrics.family === "long" ? "Sortie longue" : "Endurance"} de ${format} entre ${target.heartRateLow} et ${target.heartRateHigh} bpm${hasPace ? `, soit environ ${band(target)}` : ""} ; la fin aussi facile que le début.`;
    return { status: "ok", target, goal: null, shouldHave: execution.slice(0, 2), keep, next: { format, target, recoveryS: null, cue } };
  }

  // Tempo / seuil continu.
  if (hasPace && mainS != null && (mainS > (target.paceSlowS as number) + MISMATCH_LIMIT_S || mainS < (target.paceFastS as number) - MISMATCH_LIMIT_S)) return { status: "none", reason: MISMATCH_REASON };
  const referenceFade = input.reference?.halvesFadeSPerKm ?? null;
  const fadeDegraded = halves != null && halves.fadeSPerKm >= FADE_LIMIT_S && (referenceFade == null || halves.fadeSPerKm >= referenceFade + FADE_ABOVE_REFERENCE_S);
  const execution: string[] = [];
  if (fadeDegraded && halves) {
    const firstS = paceSeconds(halves.first.speedMps);
    if (hasPace && firstS < (target.paceSlowS as number)) execution.push(`Départ : pars à ${pace(target.paceSlowS as number)} (1re moitié à ${pace(firstS)}) pour ne plus perdre ${halves.fadeSPerKm} s/km en 2e moitié.`);
    else execution.push(`Gestion : coupe en 2 blocs avec 2:00 de trot pour ne plus perdre ${halves.fadeSPerKm} s/km en 2e moitié.`);
  }
  if (mainHr != null && mainHr > target.heartRateHigh) execution.push(`Intensité : repasse sous ${target.heartRateHigh} bpm (${target.zone}) ; ${mainHr} bpm, c'est trop intense pour ce format.`);
  const placement = placementLine(input);
  if (hasPace && mainS != null && mainS > (target.paceSlowS as number) + MARGINAL_S && !fadeDegraded && !placement) execution.push(`Allure : vise ${band(target)} ; ${pace(mainS)}, c'est sous l'intensité du format.`);
  const shouldHave = prioritize(placement, execution);
  const steadyOk = !fadeDegraded && (mainHr == null || mainHr <= target.heartRateHigh);
  const keep = steadyOk && mainS != null ? `Allure tenue à ${pace(mainS)} sans perte entre les moitiés : à reproduire.` : null;
  const format = minutes ? `${minutes} min` : "même durée";
  const cue = steadyOk
    ? `Même effort à ${band(target)}${minutes ? `, prolongé à ${minutes + 5} min` : ""} ou fractionné en 2 blocs avec 2:00 de trot.`
    : `${format} à ${band(target)}, en 2 blocs avec 2:00 de trot.`;
  return { status: "ok", target, goal: plan.goal, shouldHave, keep, next: { format, target, recoveryS: null, cue } };
}
