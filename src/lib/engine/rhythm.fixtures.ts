import type { LoadSummary } from "./load";

/** Charge 7 jours = ratio × 200 pour une moyenne hebdo de 200 (tests). */
export function createLoadSummaryFixture(ratio: number): LoadSummary {
  return { acute7d: Math.round(200 * ratio), chronicWeekly28d: 200, ratio, intensity28d: null, weeks: [], runsPerWeek8w: 6, runKmPerWeek8w: 60 };
}
