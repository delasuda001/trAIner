import { addDays, daysBetween } from "@/lib/dates";
import { formatDate, formatNumber, formatPace } from "@/lib/formatters";
import type { HeartRateZones } from "@/lib/source/types";
import type { SessionFamily, SessionKind } from "./activity-metrics";
import { SESSION_KIND_LABELS } from "./activity-metrics";
import type { LoadSummary } from "./load";
import type { RecoverySignals } from "./recovery";
import { median, present, round } from "./stats";
import { zoneRange } from "./zones";

/**
 * Suggestion de prochaine séance, 100 % déterministe (Claude ne fait que la
 * commenter). Pensée pour le rythme réel de l'athlète (1 à 2 courses par
 * semaine) : une seule séance à la fois, jamais un plan sur 5 jours.
 */

export type SuggestionType = "endurance" | "long" | "threshold" | "vo2max" | "recovery_run" | "rest";

export type SuggestedSession = {
  type: SuggestionType;
  title: string;
  durationMin: number;
  /** Déroulé concret de la séance. */
  structure: string;
  target: { zone: string; heartRateLow: number; heartRateHigh: number; paceFastMps: number | null; paceSlowMps: number | null } | null;
};

export type Suggestion = {
  primary: SuggestedSession;
  when: { date: string; label: string };
  reason: string;
  /** Proposée quand les signaux de récupération sont dégradés. */
  alternative: (SuggestedSession & { reason: string }) | null;
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
  };
};

export type SuggestionRun = {
  localDate: string;
  kind: SessionKind;
  family: SessionFamily;
  movingTimeS: number | null;
  aerobicTrainingEffect: number | null;
};

export type SuggestionInput = {
  today: string;
  runs: SuggestionRun[]; // plus anciennes d'abord
  zones: HeartRateZones;
  restingHeartRateBpm: number;
  /** Efficacité aérobie récente (m/s par bpm au-dessus du repos), pour traduire une FC cible en allure. */
  recentSpeedPerBeat: number | null;
  lactateThresholdSpeedMps: number | null;
  load: LoadSummary;
  recovery: RecoverySignals;
};

const HARD_FAMILIES: ReadonlySet<SessionFamily> = new Set(["intervals", "steady"]);

function isHard(run: SuggestionRun): boolean {
  return HARD_FAMILIES.has(run.family) || (run.aerobicTrainingEffect ?? 0) >= 4;
}

function roundTo5(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function paceRangeForHeartRates(input: SuggestionInput, low: number, high: number): { paceFastMps: number | null; paceSlowMps: number | null } {
  if (!input.recentSpeedPerBeat) return { paceFastMps: null, paceSlowMps: null };
  const speed = (heartRate: number) => round(input.recentSpeedPerBeat as number * (heartRate - input.restingHeartRateBpm), 3);
  return { paceFastMps: speed(high), paceSlowMps: speed(low) };
}

function enduranceSession(input: SuggestionInput, durationMin: number, title = "Endurance fondamentale", type: SuggestionType = "endurance"): SuggestedSession {
  const [low, high] = zoneRange(2, input.zones);
  const pace = paceRangeForHeartRates(input, low, high);
  const paceText = pace.paceFastMps && pace.paceSlowMps ? `, soit environ ${formatPace(pace.paceSlowMps)} à ${formatPace(pace.paceFastMps)} sur le plat` : "";
  return {
    type,
    title,
    durationMin,
    structure: `${durationMin} min en continu entre ${low} et ${high} bpm${paceText}. Si la FC dépasse ${high} bpm, ralentis plutôt que de forcer.`,
    target: { zone: "Z2", heartRateLow: low, heartRateHigh: high, ...pace },
  };
}

function thresholdSession(input: SuggestionInput): SuggestedSession {
  const [low, high] = zoneRange(4, input.zones);
  const lt = input.lactateThresholdSpeedMps;
  const pace = lt ? { paceFastMps: round(lt * 1.01, 3), paceSlowMps: round(lt * 0.97, 3) } : paceRangeForHeartRates(input, low, high);
  const paceText = pace.paceFastMps && pace.paceSlowMps ? ` (${formatPace(pace.paceSlowMps)} à ${formatPace(pace.paceFastMps)})` : "";
  return {
    type: "threshold",
    title: "Seuil : 3 × 10 min",
    durationMin: 60,
    structure: `15 min d'échauffement en Z2, puis 3 × 10 min entre ${low} et ${high} bpm${paceText}, 2 min de trot entre les blocs, 10 min de retour au calme.`,
    target: { zone: "Z4", heartRateLow: low, heartRateHigh: high, ...pace },
  };
}

function vo2Session(input: SuggestionInput): SuggestedSession {
  const [low] = zoneRange(5, input.zones);
  const high = input.zones.maxHeartRateBpm ? Math.round(low + (input.zones.maxHeartRateBpm - low) * 0.6) : low + 8;
  const lt = input.lactateThresholdSpeedMps;
  const pace = lt ? { paceFastMps: round(lt * 1.1, 3), paceSlowMps: round(lt * 1.06, 3) } : { paceFastMps: null, paceSlowMps: null };
  const paceText = pace.paceFastMps && pace.paceSlowMps ? ` à ${formatPace(pace.paceSlowMps)}–${formatPace(pace.paceFastMps)}` : "";
  return {
    type: "vo2max",
    title: "VO2max : 5 × 3 min",
    durationMin: 50,
    structure: `15 min d'échauffement en Z2 avec 3 accélérations, puis 5 × 3 min${paceText}, FC qui monte vers ${low}–${high} bpm en fin de répétition, 2 min de trot entre, 10 min de retour au calme.`,
    target: { zone: "Z5", heartRateLow: low, heartRateHigh: high, ...pace },
  };
}

function whenLabel(date: string, today: string): string {
  const offset = daysBetween(today, date);
  if (offset <= 0) return "Aujourd'hui";
  if (offset === 1) return "Demain";
  const label = formatDate(date, "long");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function suggestNextSession(input: SuggestionInput): Suggestion {
  const { today, runs, load, recovery } = input;
  const lastRun = runs.at(-1) ?? null;
  const lastHard = [...runs].reverse().find(isHard) ?? null;
  const lastQuality = [...runs].reverse().find((run) => run.family === "intervals" || run.family === "steady") ?? null;
  const lastLong = [...runs].reverse().find((run) => run.family === "long") ?? null;
  const since = (run: SuggestionRun | null) => (run ? daysBetween(run.localDate, today) : null);

  const daysSinceLastRun = since(lastRun);
  const daysSinceLastQuality = since(lastQuality);
  const daysSinceLastLong = since(lastLong);
  const highShare = load.intensity28d?.high ?? null;

  const recent8w = runs.filter((run) => daysBetween(run.localDate, today) < 56);
  const easyDurations = present(recent8w.filter((run) => run.family === "easy").map((run) => run.movingTimeS));
  const typicalEasyMin = easyDurations.length ? (median(easyDurations) as number) / 60 : 45;
  const longest8w = Math.max(0, ...present(recent8w.map((run) => run.movingTimeS))) / 60;

  let primary: SuggestedSession;
  let reason: string;

  if (daysSinceLastRun == null || daysSinceLastRun >= 14) {
    primary = enduranceSession(input, 40, "Reprise en endurance");
    reason = daysSinceLastRun == null ? "Aucune course récente : on repart sur une base aérobie facile." : `Ta dernière course date de ${daysSinceLastRun} jours : on reprend par de l'endurance facile avant de remettre de l'intensité.`;
  } else if (load.ratio != null && load.ratio >= 1.5) {
    primary = enduranceSession(input, roundTo5(Math.min(50, typicalEasyMin)));
    reason = `Ta charge des 7 derniers jours vaut ${formatNumber(load.ratio, 1)} fois ta moyenne des 4 semaines : on absorbe avec une séance facile.`;
  } else if (lastHard && daysBetween(lastHard.localDate, today) < 3 && lastRun === lastHard) {
    primary = enduranceSession(input, roundTo5(Math.min(50, Math.max(35, typicalEasyMin))));
    reason = `Ta dernière course (${SESSION_KIND_LABELS[lastHard.kind].toLowerCase()}) était exigeante : la suivante doit rester facile pour que le travail paie.`;
  } else if (highShare != null && highShare >= 0.4 && lastRun && lastRun.family !== "easy") {
    primary = enduranceSession(input, roundTo5(Math.min(60, Math.max(40, typicalEasyMin))));
    reason = `${formatNumber(highShare * 100)} % de ton temps des 4 dernières semaines était en Z4–Z5 : une vraie séance en Z2 rééquilibre et construit la base.`;
  } else if (daysSinceLastQuality == null || daysSinceLastQuality >= 8) {
    const lastWasVo2 = lastQuality?.kind === "intervals_vo2" || lastQuality?.kind === "intervals_short";
    primary = lastWasVo2 ? thresholdSession(input) : lastQuality?.kind === "intervals_threshold" || lastQuality?.kind === "threshold" ? vo2Session(input) : thresholdSession(input);
    reason = daysSinceLastQuality == null
      ? "Pas de séance de qualité dans ton historique récent : un travail structuré apporte le plus de progrès quand on court peu."
      : `Ta dernière séance de qualité date de ${daysSinceLastQuality} jours : avec 1 à 2 sorties par semaine, c'est elle qui fait progresser.`;
  } else if (daysSinceLastLong == null || daysSinceLastLong >= 14) {
    const duration = roundTo5(Math.min(120, Math.max(70, longest8w * 1.1)));
    primary = enduranceSession(input, duration, "Sortie longue", "long");
    reason = daysSinceLastLong == null ? "Pas de sortie longue récente : c'est le meilleur levier d'endurance." : `Ta dernière sortie longue date de ${daysSinceLastLong} jours et la qualité est faite cette semaine : allonge en restant en Z2.`;
  } else {
    primary = enduranceSession(input, roundTo5(Math.min(60, Math.max(40, typicalEasyMin))));
    reason = "Qualité et sortie longue récentes déjà faites : une endurance facile entretient sans fatiguer.";
  }

  // Quand la faire : 48 h après une séance dure, 24 h après une facile.
  let earliest = today;
  if (lastRun) {
    const gap = isHard(lastRun) || lastRun.family === "long" ? 2 : 1;
    const candidate = addDays(lastRun.localDate, gap);
    if (candidate > earliest) earliest = candidate;
  }
  if ((primary.type === "threshold" || primary.type === "vo2max") && lastHard) {
    const candidate = addDays(lastHard.localDate, 3);
    if (candidate > earliest) earliest = candidate;
  }

  let alternative: Suggestion["alternative"] = null;
  if ((recovery.state === "poor" || recovery.state === "watch") && primary.type !== "endurance") {
    const flagText = recovery.flags.map((flag) => (flag === "hrv_low" ? "VFC sous ta plage habituelle" : flag === "resting_hr_high" ? "FC de repos au-dessus de ta base" : "nuit courte")).join(", ");
    alternative = { ...enduranceSession(input, 35, "Footing facile", "recovery_run"), reason: `Si les signaux restent dégradés le jour J (${flagText}), remplace par ce footing facile.` };
  } else if (recovery.state === "poor") {
    alternative = { type: "rest", title: "Repos ou mobilité", durationMin: 20, structure: "20 min de mobilité ou de marche, pas de course.", target: null, reason: "Si les signaux restent dégradés le jour J, un jour de repos vaut mieux qu'un footing forcé." };
  }

  return {
    primary,
    when: { date: earliest, label: whenLabel(earliest, today) },
    reason,
    alternative,
    facts: {
      daysSinceLastRun,
      lastRunKind: lastRun ? SESSION_KIND_LABELS[lastRun.kind] : null,
      daysSinceLastQuality,
      daysSinceLastLong,
      highIntensityShare28d: highShare,
      loadRatio: load.ratio,
      recoveryState: recovery.state,
      recoveryFlags: recovery.flags,
      runsPerWeek8w: load.runsPerWeek8w,
    },
  };
}
