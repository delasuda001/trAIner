/**
 * Mesure des temps de calcul sur un profil à gros volume (base synthétique, aucun appel externe).
 * Usage : SILLAGE_PROFILES_DIR=./data/test/profiles npx tsx --conditions=react-server scripts/volume-timing.ts grosvolume
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const id = process.argv[2] ?? "grosvolume";
  const { runAs } = await import("@/lib/profiles/context");
  const { analyzeSession, getActivityView, getDashboard, loadContext } = await import("@/lib/server/analytics");
  const time = <T,>(label: string, fn: () => T): T => {
    const start = performance.now();
    const value = fn();
    console.log(`${label.padEnd(40)} ${Math.round(performance.now() - start)} ms`);
    return value;
  };
  runAs({ id, name: id, role: "guest" }, () => {
    const context = time("loadContext (1er passage, métriques)", () => loadContext());
    console.log(`  ${context.runs.length} courses analysées`);
    time("loadContext (métriques en cache)", () => loadContext());
    const dashboard = time("getDashboard", () => getDashboard());
    console.log(`  rythme : ${dashboard.rhythm.runsPerWeek12w}/sem, qualité tous les ${dashboard.rhythm.qualityGapMedianDays ?? "—"} j → écart ${dashboard.rhythm.qualitySpacingDays} j, seuil de charge ${dashboard.rhythm.highLoadRatio}`);
    console.log(`  suggestion : ${dashboard.suggestion.primary.title} (${dashboard.suggestion.when.label}) — ${dashboard.suggestion.reason}`);
    const last = context.runs.at(-1);
    if (last) {
      const analysis = time("analyzeSession (dernière)", () => analyzeSession(last.id));
      console.log(`  comparables : ${analysis?.comparables.length}, placement : ${analysis?.prescription.status === "ok" ? analysis.prescription.shouldHave.join(" | ") || "—" : analysis?.prescription.status}`);
      time("getActivityView (dernière)", () => getActivityView(last.id));
    }
  });
}

void main();
