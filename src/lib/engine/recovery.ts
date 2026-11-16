import { addDays } from "@/lib/dates";
import type { WellnessDay } from "@/lib/source/types";
import { mean, median, present, round } from "./stats";

/**
 * Signaux de récupération : uniquement des constats chiffrés par rapport à
 * la base personnelle (ADR-004 : pas de score de forme ni d'interprétation
 * médicale). Le moteur de suggestion s'en sert pour proposer une alternative.
 */

export type MetricVsBaseline = {
  latest: number | null;
  latestDate: string | null;
  baseline: number | null;
  delta: number | null;
  /** 28 derniers jours pour la mini-courbe (null = pas de donnée). */
  series: Array<{ date: string; value: number | null }>;
};

export type RecoverySignals = {
  hrv: MetricVsBaseline & { baselineLow: number | null; baselineHigh: number | null; status: string | null };
  sleep: MetricVsBaseline & { score: number | null; baselineScore: number | null };
  restingHr: MetricVsBaseline;
  flags: Array<"hrv_low" | "resting_hr_high" | "sleep_short">;
  state: "ok" | "watch" | "poor" | "unknown";
};

const SERIES_DAYS = 28;

function lastWith(days: WellnessDay[], pick: (day: WellnessDay) => number | null, today: string): WellnessDay | null {
  const recent = days.filter((day) => day.date <= today && day.date >= addDays(today, -2) && pick(day) != null);
  return recent.at(-1) ?? null;
}

function series(days: WellnessDay[], pick: (day: WellnessDay) => number | null, today: string) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: SERIES_DAYS }, (_, index) => {
    const date = addDays(today, index - SERIES_DAYS + 1);
    const day = byDate.get(date);
    return { date, value: day ? pick(day) : null };
  });
}

function baselineOf(days: WellnessDay[], pick: (day: WellnessDay) => number | null, before: string, aggregate: (values: number[]) => number | null): number | null {
  const values = present(days.filter((day) => day.date < before && day.date >= addDays(before, -SERIES_DAYS)).map(pick));
  return values.length >= 7 ? aggregate(values) : null;
}

export function assessRecovery(days: WellnessDay[], today: string): RecoverySignals {
  const hrvPick = (day: WellnessDay) => day.hrvLastNightMs;
  const sleepPick = (day: WellnessDay) => day.sleepDurationS;
  const rhrPick = (day: WellnessDay) => day.restingHeartRateBpm;

  const hrvDay = lastWith(days, hrvPick, today);
  const sleepDay = lastWith(days, sleepPick, today);
  const rhrDay = lastWith(days, rhrPick, today);

  const hrvBaseline = hrvDay ? baselineOf(days, hrvPick, hrvDay.date, mean) : null;
  const sleepBaseline = sleepDay ? baselineOf(days, sleepPick, sleepDay.date, mean) : null;
  const sleepScoreBaseline = sleepDay ? baselineOf(days, (day) => day.sleepScore, sleepDay.date, mean) : null;
  const rhrBaseline = rhrDay ? baselineOf(days, rhrPick, rhrDay.date, median) : null;

  const hrvLatest = hrvDay?.hrvLastNightMs ?? null;
  const hrv = {
    latest: hrvLatest,
    latestDate: hrvDay?.date ?? null,
    baseline: hrvBaseline == null ? null : round(hrvBaseline, 0),
    delta: hrvLatest != null && hrvBaseline != null ? round(hrvLatest - hrvBaseline, 0) : null,
    series: series(days, hrvPick, today),
    baselineLow: hrvDay?.hrvBaselineLowMs ?? null,
    baselineHigh: hrvDay?.hrvBaselineHighMs ?? null,
    status: hrvDay?.hrvStatus ?? null,
  };
  const sleepLatest = sleepDay?.sleepDurationS ?? null;
  const sleep = {
    latest: sleepLatest,
    latestDate: sleepDay?.date ?? null,
    baseline: sleepBaseline == null ? null : Math.round(sleepBaseline),
    delta: sleepLatest != null && sleepBaseline != null ? Math.round(sleepLatest - sleepBaseline) : null,
    series: series(days, sleepPick, today),
    score: sleepDay?.sleepScore ?? null,
    baselineScore: sleepScoreBaseline == null ? null : Math.round(sleepScoreBaseline),
  };
  const rhrLatest = rhrDay?.restingHeartRateBpm ?? null;
  const restingHr = {
    latest: rhrLatest,
    latestDate: rhrDay?.date ?? null,
    baseline: rhrBaseline == null ? null : round(rhrBaseline, 0),
    delta: rhrLatest != null && rhrBaseline != null ? round(rhrLatest - rhrBaseline, 0) : null,
    series: series(days, rhrPick, today),
  };

  const flags: RecoverySignals["flags"] = [];
  const hrvBelowRange = hrvLatest != null && hrv.baselineLow != null && hrvLatest < hrv.baselineLow;
  if (hrvBelowRange || hrv.status === "LOW" || hrv.status === "POOR") flags.push("hrv_low");
  if (restingHr.delta != null && restingHr.delta >= 5) flags.push("resting_hr_high");
  if ((sleepLatest != null && sleepLatest < 6 * 3600) || (sleep.delta != null && sleep.delta <= -75 * 60)) flags.push("sleep_short");

  const hasData = hrvLatest != null || sleepLatest != null || rhrLatest != null;
  const state: RecoverySignals["state"] = !hasData ? "unknown" : flags.length >= 2 || (flags.includes("hrv_low") && flags.includes("resting_hr_high")) ? "poor" : flags.length === 1 ? "watch" : "ok";
  return { hrv, sleep, restingHr, flags, state };
}

/** FC de repos de référence pour les calculs d'efficacité (médiane 60 jours, 50 bpm par défaut). */
export function referenceRestingHeartRate(days: WellnessDay[], today: string): number {
  const values = present(days.filter((day) => day.date <= today && day.date > addDays(today, -60)).map((day) => day.restingHeartRateBpm));
  return values.length >= 5 ? Math.round(median(values) as number) : 50;
}
