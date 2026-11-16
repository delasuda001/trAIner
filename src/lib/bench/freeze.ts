import "server-only";

import { goalForCoach } from "@/lib/goal/goal";
import { formatDate } from "@/lib/formatters";
import { sessionTitle } from "@/lib/engine/activity-metrics";
import { analyzeSession, loadContext, type SessionAnalysis } from "@/lib/server/analytics";
import type { BenchCategory, BenchFixture } from "./types";

/**
 * Fige un jeu de séances représentatives : les entrées du moteur (métriques,
 * comparaisons, contexte, consignes), jamais les flux ni le GPS. À relancer
 * quand le moteur change (`npx tsx --conditions=react-server scripts/bench-freeze.ts`).
 */

function categoryOf(analysis: SessionAnalysis): BenchCategory[] {
  const { metrics, prescription, verdict } = analysis;
  const categories: BenchCategory[] = [];
  if (prescription.status === "none") categories.push("mal_reconnue");
  if (verdict.level === "below") categories.push("seance_ratee");
  if (metrics.kind === "endurance" || metrics.kind === "recovery") categories.push("endurance");
  if (metrics.kind === "long") categories.push("sortie_longue");
  if (metrics.kind === "intervals_short") categories.push("fractionne_court");
  if (metrics.kind === "intervals_vo2" && (metrics.work?.averageDurationS ?? 0) >= 240) categories.push("fractionne_long");
  if (metrics.kind === "intervals_threshold" || metrics.kind === "threshold" || metrics.kind === "tempo" || metrics.kind === "intervals_tempo") categories.push("seuil");
  return categories;
}

const ORDER: BenchCategory[] = ["fractionne_long", "fractionne_court", "seuil", "endurance", "sortie_longue", "seance_ratee", "mal_reconnue"];

export function freezeFixtures(maxFixtures = 6): BenchFixture[] {
  const context = loadContext();
  const analyses = [...context.runs].reverse().map((run) => analyzeSession(run.id, context)).filter((analysis): analysis is SessionAnalysis => analysis != null);
  const chosen = new Map<BenchCategory, SessionAnalysis>();
  const used = new Set<string>();
  // Pour chaque catégorie, la séance la plus récente pas encore retenue.
  for (const category of ORDER) {
    const match = analyses.find((analysis) => !used.has(analysis.activity.id) && categoryOf(analysis).includes(category));
    if (match && chosen.size < maxFixtures) {
      chosen.set(category, match);
      used.add(match.activity.id);
    }
  }
  const frozenAt = new Date().toISOString();
  return [...chosen.entries()].map(([category, analysis]) => ({
    id: `${category}-${analysis.activity.localDate}`,
    category,
    label: `${sessionTitle(analysis.metrics)}, ${formatDate(analysis.activity.localDate, "medium")}`,
    frozenAt,
    input: {
      session: analysis.activity,
      metrics: analysis.metrics,
      deltas: analysis.deltas,
      verdict: analysis.verdict,
      comparables: analysis.comparables,
      zones: analysis.profile.zones,
      lactateThresholdSpeedMps: analysis.profile.lactateThresholdSpeedMps,
      context: analysis.context,
      goal: goalForCoach(analysis.goal, analysis.activity.localDate),
      feeling: analysis.feeling,
      prescription: analysis.prescription,
    },
  }));
}
