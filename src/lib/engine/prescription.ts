import { formatClock, formatPace } from "@/lib/formatters";
import type { HeartRateZones } from "@/lib/source/types";
import type { ActivityMetrics, SessionKind } from "./activity-metrics";
import { paceSeconds } from "./activity-metrics";
import { zoneRange } from "./zones";

/**
 * Consignes chiffrées d'une séance, 100 % déterministes : comment elle aurait
 * dû être menée, et quoi faire la prochaine fois sur le même type de séance.
 * Claude ne fait que choisir et formuler : toutes les cibles qu'il cite
 * viennent d'ici (le garde-fou rejette tout chiffre absent de la charge utile).
 *
 * Allures de référence : seuil mesuré par la montre et objectifs chiffrés de
 * l'athlète. Les allures de course « réalistes » sont estimées à partir du
 * seuil (ratios usuels, voir RACE_RATIO_FROM_THRESHOLD) : ce sont des repères,
 * pas des prédictions.
 */

export type RaceTarget = { distanceKm: number; targetTimeS: number };

/** Vitesse de course tenable ≈ vitesse au seuil × ratio (repères d'entraînement usuels). */
export const RACE_RATIO_FROM_THRESHOLD: Record<string, { distanceKm: number; ratio: number; label: string }> = {
  "5": { distanceKm: 5, ratio: 1.06, label: "5 km" },
  "10": { distanceKm: 10, ratio: 1.025, label: "10 km" },
  "21.0975": { distanceKm: 21.0975, ratio: 0.975, label: "semi" },
  "42.195": { distanceKm: 42.195, ratio: 0.92, label: "marathon" },
};

/** Écart (s/km) entre l'allure visée et l'allure réaliste du moment. */
const REACHABLE_GAP_S = 3;
const STRETCH_GAP_S = 8;
/** Dégradation (s/km) entre premières et dernières répétitions, ou entre moitiés, jugée significative. */
const FADE_LIMIT_S = 5;
/** Charge 7 j / moyenne 4 semaines au-delà de laquelle le moteur de suggestion propose une séance facile. */
const HIGH_LOAD_RATIO = 1.5;
/** Au-delà de cet écart (s/km) avec la cible du format, la séance est sans doute d'un autre type : pas de consigne. */
const MISMATCH_LIMIT_S = 25;
/** Marge (s/km) au-delà de la fourchette avant de dire « plus rapide / plus lent que la cible ». */
const ON_TARGET_TOLERANCE_S = 1;
const MISMATCH_REASON = "allure trop éloignée de la cible du format reconnu, séance probablement d'un autre type";

export type PrescriptionTarget = {
  /** « allure 5 km réaliste », « seuil », « endurance Z2 »… */
  label: string;
  /** Fourchette d'allure en s/km (rapide, lente), si elle est calculable. */
  paceFastS: number | null;
  paceSlowS: number | null;
  heartRateLow: number;
  heartRateHigh: number;
  zone: string;
};

export type GoalMarker = {
  race: string;
  goalTimeS: number;
  goalPaceS: number;
  realisticPaceS: number;
  realisticTimeS: number;
  /** > 0 : l'allure visée est plus rapide que l'allure réaliste du moment. */
  gapS: number;
  status: "reachable" | "stretch" | "out_of_reach";
};

export type Prescription =
  | { status: "none"; reason: string }
  | {
      status: "ok";
      target: PrescriptionTarget;
      goal: GoalMarker | null;
      /** Comment la séance aurait dû être menée : phrases courtes, chiffrées, par ordre d'importance. */
      shouldHave: string[];
      /** À reproduire : ce qui était dans la cible. */
      keep: string | null;
      /** La prochaine séance du même type. */
      next: { format: string; target: PrescriptionTarget; recoveryS: number | null; cue: string };
    };

export type PrescriptionInput = {
  metrics: ActivityMetrics;
  zones: HeartRateZones;
  lactateThresholdSpeedMps: number | null;
  restingHeartRateBpm: number;
  /** Vitesse par battement au-dessus du repos des sorties faciles récentes (traduit une FC cible en allure). */
  recentSpeedPerBeat: number | null;
  movingTimeS: number | null;
  raceTargets: RaceTarget[];
  context: { loadRatio: number | null; qualityBefore: Array<{ title: string; daysBefore: number }> } | null;
};

function pace(seconds: number): string {
  return formatPace(1000 / seconds);
}

function band(target: PrescriptionTarget): string {
  if (target.paceFastS == null || target.paceSlowS == null) return `${target.heartRateLow}–${target.heartRateHigh} bpm`;
  return `${pace(target.paceFastS).replace("/km", "")}–${pace(target.paceSlowS)}`;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function realisticPaceS(lactateThresholdSpeedMps: number, distanceKm: number): number | null {
  const entry = Object.values(RACE_RATIO_FROM_THRESHOLD).find((race) => Math.abs(race.distanceKm - distanceKm) < 0.05);
  return entry ? paceSeconds(lactateThresholdSpeedMps * entry.ratio) : null;
}

export function goalMarker(lactateThresholdSpeedMps: number | null, targets: RaceTarget[], distanceKm: number): GoalMarker | null {
  const target = targets.find((entry) => Math.abs(entry.distanceKm - distanceKm) < 0.05);
  if (!target || !lactateThresholdSpeedMps) return null;
  const realistic = realisticPaceS(lactateThresholdSpeedMps, distanceKm);
  if (realistic == null) return null;
  const goalPaceS = Math.round(target.targetTimeS / target.distanceKm);
  const gapS = realistic - goalPaceS;
  const label = Object.values(RACE_RATIO_FROM_THRESHOLD).find((race) => Math.abs(race.distanceKm - distanceKm) < 0.05)?.label ?? `${distanceKm} km`;
  return {
    race: label,
    goalTimeS: target.targetTimeS,
    goalPaceS,
    realisticPaceS: realistic,
    realisticTimeS: Math.round(realistic * target.distanceKm),
    gapS,
    status: gapS <= REACHABLE_GAP_S ? "reachable" : gapS <= STRETCH_GAP_S ? "stretch" : "out_of_reach",
  };
}

/** Phrase de situation par rapport à l'objectif, avec la cible réaliste quand l'objectif est hors de portée. */
export function goalSentence(marker: GoalMarker): string {
  const head = `Objectif ${marker.race} en ${formatClock(marker.goalTimeS)} : ${pace(marker.goalPaceS)}`;
  const realistic = `ton repère actuel (seuil montre) donne environ ${pace(marker.realisticPaceS)}, soit ${formatClock(marker.realisticTimeS)}`;
  if (marker.status === "reachable") return `${head} ; ${realistic} : l'objectif est à portée, travaille à l'allure visée.`;
  if (marker.status === "stretch") return `${head} ; ${realistic} : ${marker.gapS} s/km à gagner, objectif ambitieux mais crédible.`;
  return `${head} ; ${realistic} : ${marker.gapS} s/km d'écart, hors de portée aujourd'hui. Cible réaliste du moment : ${pace(marker.realisticPaceS)}.`;
}

type Plan = { target: PrescriptionTarget; goal: GoalMarker | null; recoveryS: number | null; maxReps: number };

/** Allure d'entraînement visée sur la course de référence : l'objectif s'il est à portée, sinon l'allure réaliste. */
function raceAimS(marker: GoalMarker | null, fallbackS: number): number {
  if (!marker) return fallbackS;
  return marker.status === "out_of_reach" ? marker.realisticPaceS : marker.goalPaceS;
}

function hr(zone: 1 | 2 | 3 | 4 | 5, zones: HeartRateZones): [number, number] {
  return zoneRange(zone, zones);
}

/** Cible d'un format de fractionné (partagée avec la suggestion de prochaine séance). */
export function intervalTarget(kind: SessionKind, repDurationS: number, input: Pick<PrescriptionInput, "zones" | "lactateThresholdSpeedMps" | "raceTargets">): PrescriptionTarget | null {
  return intervalPlan(kind, repDurationS, input)?.target ?? null;
}

function intervalPlan(kind: SessionKind, repDurationS: number, input: Pick<PrescriptionInput, "zones" | "lactateThresholdSpeedMps" | "raceTargets">): Plan | null {
  const lt = input.lactateThresholdSpeedMps;
  const zones = input.zones;
  const ltS = lt ? paceSeconds(lt) : null;
  const around = (centerS: number | null, half: number) => (centerS == null ? { paceFastS: null, paceSlowS: null } : { paceFastS: centerS - half, paceSlowS: centerS + half });
  if (kind === "intervals_short") {
    const [low] = hr(4, zones);
    const center = lt ? paceSeconds(lt * 1.14) : null;
    return { target: { label: "vitesse (allure 1 500 m)", ...around(center, 3), heartRateLow: low, heartRateHigh: hr(5, zones)[1], zone: "Z4–Z5" }, goal: goalMarker(lt, input.raceTargets, 5), recoveryS: roundTo(Math.min(120, Math.max(60, repDurationS)), 15), maxReps: 12 };
  }
  if (kind === "intervals_vo2") {
    const marker = goalMarker(lt, input.raceTargets, 5);
    const [low] = hr(5, zones);
    const high = zones.maxHeartRateBpm ? Math.round(low + (zones.maxHeartRateBpm - low) * 0.6) : low + 8;
    // Répétitions courtes (< 3 min) : allure 3 km ; plus longues : allure 5 km.
    const center = repDurationS < 180 ? (lt ? paceSeconds(lt * 1.09) : null) : lt ? raceAimS(marker, paceSeconds(lt * 1.06)) : null;
    const label = repDurationS < 180 ? "allure 3 km" : marker && marker.status !== "out_of_reach" ? "allure 5 km visée" : "allure 5 km réaliste";
    return { target: { label, ...around(center, 3), heartRateLow: low, heartRateHigh: high, zone: "Z5" }, goal: marker, recoveryS: roundTo(Math.min(180, Math.max(90, repDurationS * 0.4)), 15), maxReps: repDurationS >= 240 ? 6 : 10 };
  }
  if (kind === "intervals_threshold") {
    const [low, high] = hr(4, zones);
    return { target: { label: "seuil", paceFastS: ltS != null ? ltS - 3 : null, paceSlowS: ltS != null ? ltS + 4 : null, heartRateLow: low, heartRateHigh: high, zone: "Z4" }, goal: goalMarker(lt, input.raceTargets, 21.0975), recoveryS: roundTo(Math.min(120, Math.max(60, repDurationS * 0.2)), 15), maxReps: 6 };
  }
  if (kind === "intervals_tempo") {
    const marker = goalMarker(lt, input.raceTargets, 21.0975);
    const center = lt ? raceAimS(marker, paceSeconds(lt * 0.975)) : null;
    return { target: { label: marker && marker.status !== "out_of_reach" ? "allure semi visée" : "allure semi réaliste", ...around(center, 4), heartRateLow: hr(3, zones)[0], heartRateHigh: hr(4, zones)[1], zone: "Z3–Z4" }, goal: marker, recoveryS: 60, maxReps: 5 };
  }
  return null;
}

function continuousPlan(kind: SessionKind, input: PrescriptionInput): Plan | null {
  const lt = input.lactateThresholdSpeedMps;
  const zones = input.zones;
  if (kind === "threshold") {
    const ltS = lt ? paceSeconds(lt) : null;
    const [low, high] = hr(4, zones);
    return { target: { label: "seuil", paceFastS: ltS != null ? ltS - 3 : null, paceSlowS: ltS != null ? ltS + 4 : null, heartRateLow: low, heartRateHigh: high, zone: "Z4" }, goal: goalMarker(lt, input.raceTargets, 21.0975), recoveryS: null, maxReps: 1 };
  }
  if (kind === "tempo") {
    const marker = goalMarker(lt, input.raceTargets, 21.0975);
    const center = lt ? raceAimS(marker, paceSeconds(lt * 0.975)) : null;
    return { target: { label: marker && marker.status !== "out_of_reach" ? "allure semi visée" : "allure semi réaliste", paceFastS: center != null ? center - 4 : null, paceSlowS: center != null ? center + 4 : null, heartRateLow: hr(3, zones)[0], heartRateHigh: hr(4, zones)[1], zone: "Z3–Z4" }, goal: marker, recoveryS: null, maxReps: 1 };
  }
  // Endurance, récupération, sortie longue : FC en Z2 (Z1–Z2 en récupération), allure traduite de la FC.
  const [z2Low, z2High] = hr(2, zones);
  const low = kind === "recovery" ? zones.floors[0] : z2Low;
  const high = kind === "recovery" ? z2Low + 5 : z2High;
  const perBeat = input.recentSpeedPerBeat ?? input.metrics.aerobic?.speedPerBeat ?? null;
  const toPace = (heartRate: number) => (perBeat ? paceSeconds(perBeat * (heartRate - input.restingHeartRateBpm)) : null);
  return { target: { label: kind === "recovery" ? "récupération" : "endurance Z2", paceFastS: toPace(high - 3), paceSlowS: toPace(Math.max(low, high - 9)), heartRateLow: low, heartRateHigh: high, zone: kind === "recovery" ? "Z1–Z2" : "Z2" }, goal: null, recoveryS: null, maxReps: 1 };
}

/** « 3 × 2 km », « 6 × 800 m », « 8 × 70 s ». */
function repFormat(distanceM: number | null, durationS: number): string {
  if (distanceM && distanceM >= 950) return `${String(Math.round(distanceM / 100) / 10).replace(".", ",")} km`;
  if (distanceM && distanceM >= 400) return `${Math.round(distanceM / 50) * 50} m`;
  return durationS < 90 ? `${Math.round(durationS / 5) * 5} s` : formatClock(roundTo(durationS, 15));
}

function placementLines(input: PrescriptionInput, quality: boolean): string[] {
  const lines: string[] = [];
  const context = input.context;
  if (!context || !quality) return lines;
  if (context.loadRatio != null && context.loadRatio >= HIGH_LOAD_RATIO) {
    lines.push(`Placement : charge 7 jours à ${String(Math.round(context.loadRatio * 10) / 10).replace(".", ",")} fois ta moyenne ce jour-là ; au-delà de ${String(HIGH_LOAD_RATIO).replace(".", ",")}, une endurance facile ou un report de 1 à 2 jours aurait mieux servi cette séance.`);
  }
  const close = context.qualityBefore.find((entry) => entry.daysBefore < 3);
  if (close) lines.push(`Placement : ${close.title} seulement ${close.daysBefore} jour${close.daysBefore > 1 ? "s" : ""} avant ; laisse 72 h entre deux séances de qualité.`);
  return lines;
}

export function prescribe(input: PrescriptionInput): Prescription {
  const { metrics } = input;
  const work = metrics.work;
  const isQuality = metrics.family === "intervals" || metrics.family === "steady";

  if (metrics.family === "intervals") {
    if (!work || work.reps < 2) return { status: "none", reason: "répétitions non reconnues" };
    const plan = intervalPlan(metrics.kind, work.averageDurationS, input);
    if (!plan) return { status: "none", reason: "type de fractionné non pris en charge" };
    const { target } = plan;
    const reps = work.repsDetail.map((rep) => paceSeconds(rep.speedMps));
    const first = reps[0];
    const last = reps[reps.length - 1];
    const averageS = paceSeconds(work.averageSpeedMps);
    const fade = work.fadeSPerKm ?? 0;
    const repHr = work.averageHeartRateBpm != null ? Math.round(work.averageHeartRateBpm) : null;
    const lines: string[] = [];
    const hasPace = target.paceFastS != null && target.paceSlowS != null;
    const fast = target.paceFastS ?? 0;
    const slow = target.paceSlowS ?? 0;
    const recovery = work.averageRecoveryS != null ? Math.round(work.averageRecoveryS) : null;
    const shortRecovery = plan.recoveryS != null && recovery != null && recovery < plan.recoveryS - 15;
    if (hasPace && (averageS > slow + MISMATCH_LIMIT_S || averageS < fast - MISMATCH_LIMIT_S)) return { status: "none", reason: MISMATCH_REASON };

    if (fade >= FADE_LIMIT_S) {
      if (hasPace && first < fast) lines.push(`Départ trop rapide : 1re répétition à ${pace(first)} pour une cible ${band(target)} ; partir à ${pace(slow)} aurait évité de finir à ${pace(last)}.`);
      else if (shortRecovery) lines.push(`Récupération : ${formatClock(recovery)} entre les répétitions pour ${formatClock(plan.recoveryS)} conseillées sur ce format ; c'est le levier le plus direct contre les ${fade} s/km perdus sur la dernière.`);
      else lines.push(`Gestion : ${fade} s/km perdus de la 1re à la dernière répétition ; pars à ${hasPace ? pace(slow) : "l'allure de la dernière"} dès la 1re pour finir à la même allure.`);
    }
    if (hasPace && averageS > slow + ON_TARGET_TOLERANCE_S && fade < FADE_LIMIT_S) lines.push(`Allure : répétitions à ${pace(averageS)}, plus lentes que la cible ${band(target)}, sans perte en fin de séance : l'effort était plafonné dès le départ.`);
    if (hasPace && averageS < fast - ON_TARGET_TOLERANCE_S && fade < FADE_LIMIT_S) lines.push(`Allure : répétitions à ${pace(averageS)}, plus rapides que la cible ${band(target)} ; reste dans la fourchette pour garder la bonne intensité.`);
    if (repHr != null && repHr > target.heartRateHigh && metrics.kind !== "intervals_short" && metrics.kind !== "intervals_vo2") lines.push(`Intensité : FC des répétitions à ${repHr} bpm, au-dessus de la cible ${target.heartRateLow}–${target.heartRateHigh} bpm (${target.zone}) ; ralentir jusqu'à repasser sous ${target.heartRateHigh} bpm.`);
    if (shortRecovery && !lines.some((line) => line.startsWith("Récupération"))) lines.push(`Récupération : ${formatClock(recovery)} prises, ${formatClock(plan.recoveryS)} conseillées pour ce format.`);
    lines.push(...placementLines(input, isQuality));

    const onTarget = hasPace && averageS >= fast - ON_TARGET_TOLERANCE_S && averageS <= slow + ON_TARGET_TOLERANCE_S && fade < FADE_LIMIT_S;
    const keep = onTarget ? `Répétitions à ${pace(averageS)} dans la cible ${band(target)}, avec ${Math.abs(fade)} s/km d'écart entre premières et dernières : à reproduire.` : fade < FADE_LIMIT_S ? `Régularité : ${Math.abs(fade)} s/km d'écart entre premières et dernières répétitions, à garder.` : null;

    const format = `${work.reps} × ${repFormat(work.averageDistanceM, work.averageDurationS)}`;
    let nextFormat = format;
    let nextTarget = target;
    let cue: string;
    if (!onTarget || fade >= FADE_LIMIT_S) {
      cue = `Même format ${format} à ${band(target)}, récupération ${formatClock(plan.recoveryS ?? recovery)} ; 1re répétition à ${hasPace ? pace(slow) : `${target.heartRateLow} bpm`}, pas plus vite.`;
    } else if (plan.goal && plan.goal.status !== "out_of_reach" && hasPace && fast > plan.goal.goalPaceS) {
      nextTarget = { ...target, paceFastS: fast - 3, paceSlowS: slow - 3 };
      cue = `Même format ${format}, 3 s/km plus vite : ${band(nextTarget)}, récupération ${formatClock(plan.recoveryS ?? recovery)}.`;
    } else if (work.reps < plan.maxReps) {
      nextFormat = format.replace(/^\d+/, String(work.reps + 1));
      cue = `Une répétition de plus : ${nextFormat} à ${band(target)}, récupération ${formatClock(plan.recoveryS ?? recovery)}.`;
    } else {
      cue = `Même format ${format} à ${band(target)} : le volume est au maximum utile, garde la qualité.`;
    }
    return { status: "ok", target, goal: plan.goal, shouldHave: lines, keep, next: { format: nextFormat, target: nextTarget, recoveryS: plan.recoveryS, cue } };
  }

  const plan = continuousPlan(metrics.kind, input);
  if (!plan) return { status: "none", reason: "type de séance non pris en charge" };
  const { target } = plan;
  const lines: string[] = [];
  const mainHr = metrics.mainHeartRateBpm != null ? Math.round(metrics.mainHeartRateBpm) : null;
  const mainS = metrics.mainSpeedMps ? paceSeconds(metrics.mainSpeedMps) : null;
  const halves = metrics.halves;
  const hasPace = target.paceFastS != null && target.paceSlowS != null;
  const minutes = input.movingTimeS ? Math.max(5, roundTo(input.movingTimeS / 60, 5)) : null;

  if (metrics.family === "easy" || metrics.family === "long") {
    if (mainHr != null && mainHr > target.heartRateHigh) lines.push(`Intensité : FC moyenne à ${mainHr} bpm, au-dessus de ${target.heartRateHigh} bpm (haut de ${target.zone}) ; ${hasPace ? `ralentir vers ${band(target)}` : "ralentir"} pour rester en endurance.`);
    if (halves?.driftPct != null && halves.driftPct > 5) lines.push(`Départ : dérive cardiaque de ${String(Math.round(halves.driftPct * 10) / 10).replace(".", ",")} % entre les moitiés ; partir ${hasPace ? `à ${pace(target.paceSlowS as number)}` : "plus lentement"} sur les 15 premières minutes.`);
    const keep = mainHr != null && mainHr <= target.heartRateHigh ? `FC moyenne à ${mainHr} bpm, dans la cible ${target.heartRateLow}–${target.heartRateHigh} bpm : à reproduire.` : null;
    const nextMinutes = metrics.family === "long" && minutes ? Math.min(120, roundTo(minutes * 1.1, 5)) : minutes;
    const format = nextMinutes ? `${nextMinutes} min` : "même durée";
    const cue = `${metrics.family === "long" ? "Sortie longue" : "Endurance"} de ${format} entre ${target.heartRateLow} et ${target.heartRateHigh} bpm${hasPace ? `, soit environ ${band(target)}` : ""} ; la fin aussi facile que le début.`;
    return { status: "ok", target, goal: null, shouldHave: lines, keep, next: { format, target, recoveryS: null, cue } };
  }

  // Tempo / seuil continu.
  if (hasPace && mainS != null && (mainS > (target.paceSlowS as number) + MISMATCH_LIMIT_S || mainS < (target.paceFastS as number) - MISMATCH_LIMIT_S)) return { status: "none", reason: MISMATCH_REASON };
  if (halves && halves.fadeSPerKm >= FADE_LIMIT_S) {
    const firstS = paceSeconds(halves.first.speedMps);
    const split = `2e moitié ${halves.fadeSPerKm} s/km plus lente que la 1re (${pace(firstS)} puis ${pace(paceSeconds(halves.second.speedMps))})`;
    if (hasPace && firstS < (target.paceSlowS as number)) lines.push(`Départ : ${split} ; partir à ${pace(target.paceSlowS as number)} pour tenir jusqu'au bout.`);
    else lines.push(`Gestion : ${split} ; en 2 blocs avec 2:00 de trot, l'allure tient mieux.`);
  }
  if (hasPace && mainS != null && mainS > (target.paceSlowS as number) + 3) lines.push(`Allure : ${pace(mainS)} pour une cible ${band(target)}.`);
  if (mainHr != null && mainHr > target.heartRateHigh) lines.push(`Intensité : FC à ${mainHr} bpm, au-dessus de ${target.heartRateHigh} bpm (${target.zone}) : trop intense pour ce format.`);
  lines.push(...placementLines(input, isQuality));
  const steadyOk = (!halves || halves.fadeSPerKm < FADE_LIMIT_S) && (mainHr == null || mainHr <= target.heartRateHigh);
  const keep = steadyOk && mainS != null ? `Allure tenue à ${pace(mainS)} sans perte entre les moitiés : à reproduire.` : null;
  const format = minutes ? `${minutes} min` : "même durée";
  const cue = steadyOk
    ? `Même effort à ${band(target)}${minutes ? `, prolongé à ${minutes + 5} min` : ""} ou fractionné en 2 blocs avec 2:00 de trot.`
    : `${format} à ${band(target)}, en 2 blocs avec 2:00 de trot si la 2e moitié décroche encore.`;
  return { status: "ok", target, goal: plan.goal, shouldHave: lines, keep, next: { format, target, recoveryS: null, cue } };
}
