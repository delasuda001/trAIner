import { describe, expect, it } from "vitest";
import type { HeartRateZones } from "@/lib/source/types";
import { computeActivityMetrics, type ActivityMetrics } from "@/lib/engine/activity-metrics";
import { prescribe } from "@/lib/engine/prescription";
import { median } from "@/lib/engine/stats";
import { recalibrateEasyZones, zoneOf } from "@/lib/engine/zones";
import { checkSession, type EasyBaseline, type Finding } from "./coherence";

/**
 * Profils types (synthétiques, aucune donnée réelle) passés dans toute la chaîne du moteur
 * — recalage des zones, métriques, type de séance, consignes — puis dans le contrôleur de
 * cohérence. Un correctif fait pour un profil ne doit pas en casser un autre : chaque profil
 * type doit sortir sans erreur du contrôleur.
 *
 * - « entraîné, zones génériques » : footings à 140–146 bpm, zones montre en % de FC max (Z2 ≤ 133) ;
 * - « zones mesurées » : FC seuil connue, footings dans la Z2 ;
 * - « zones personnalisées » : % de FC max réglés à la main, footings en haut de Z2 ;
 * - « débutant » : peu de sorties, allure lente, FC haute.
 */

type RunSpec = { minutes: number; paceS: number; hr: number; label: string; climbPerKm?: number };

type Archetype = { name: string; zones: HeartRateZones; rest: number; runs: RunSpec[] };

const easyRun = (paceS: number, hr: number, minutes = 50): RunSpec => ({ minutes, paceS, hr, label: "AEROBIC_BASE" });

const ARCHETYPES: Archetype[] = [
  {
    name: "entraîné, zones génériques",
    zones: { floors: [96, 115, 134, 154, 173], maxHeartRateBpm: 192, lactateThresholdHeartRateBpm: null, method: "HR_MAX" },
    rest: 42,
    runs: [easyRun(330, 139), easyRun(320, 142), easyRun(305, 144), easyRun(300, 144), easyRun(332, 141), easyRun(315, 145), easyRun(342, 139), easyRun(325, 148), { minutes: 52, paceS: 267, hr: 166, label: "VO2MAX" }, { minutes: 121, paceS: 272, hr: 170, label: "VO2MAX", climbPerKm: 22 }, { minutes: 88, paceS: 333, hr: 145, label: "AEROBIC_BASE" }],
  },
  {
    name: "zones mesurées",
    zones: { floors: [110, 128, 149, 159, 167], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" },
    rest: 46,
    runs: [easyRun(345, 136), easyRun(340, 138), easyRun(350, 135), easyRun(338, 139), easyRun(355, 134), easyRun(342, 137), { minutes: 47, paceS: 255, hr: 166, label: "LACTATE_THRESHOLD" }, { minutes: 95, paceS: 350, hr: 140, label: "AEROBIC_BASE" }],
  },
  {
    name: "zones personnalisées",
    zones: { floors: [123, 136, 150, 163, 179], maxHeartRateBpm: 192, lactateThresholdHeartRateBpm: null, method: "HR_MAX" },
    rest: 55,
    runs: [easyRun(410, 145), easyRun(400, 148), easyRun(395, 149), easyRun(420, 141), easyRun(405, 147), easyRun(398, 148), { minutes: 40, paceS: 360, hr: 160, label: "TEMPO" }],
  },
  {
    name: "débutant",
    zones: { floors: [95, 114, 133, 152, 171], maxHeartRateBpm: 190, lactateThresholdHeartRateBpm: null, method: "PERCENT_MAX_HR_DEFAULT" },
    rest: 62,
    runs: [easyRun(450, 150, 25), easyRun(445, 152, 28), easyRun(460, 149, 30)],
  },
];

function hrTimeInZones(zones: HeartRateZones, hr: number, seconds: number): number[] {
  const zone = Math.max(1, zoneOf(hr, zones));
  return [1, 2, 3, 4, 5].map((index) => (index === zone ? seconds : 0));
}

function metricsFor(spec: RunSpec, zones: HeartRateZones, rest: number, recalibrated: boolean): ActivityMetrics {
  const movingTimeS = spec.minutes * 60;
  const speed = 1000 / spec.paceS;
  return computeActivityMetrics({
    streams: null, laps: [], zones, zonesRecalibrated: recalibrated, restingHeartRateBpm: rest, movingTimeS, distanceM: speed * movingTimeS,
    elevationGainM: (spec.climbPerKm ?? 5) * speed * movingTimeS / 1000, averageSpeedMps: speed, averageHeartRateBpm: spec.hr, averageCadenceSpm: 165,
    hrTimeInZonesS: hrTimeInZones(zones, spec.hr, movingTimeS), trainingEffectLabel: spec.label,
  });
}

function runArchetype(archetype: Archetype): { zones: HeartRateZones; findings: Finding[] } {
  const easyAverages = archetype.runs.filter((run) => run.label === "AEROBIC_BASE" && run.minutes >= 20).map((run) => run.hr);
  const recalibration = recalibrateEasyZones(archetype.zones, easyAverages);
  const zones = recalibration?.zones ?? archetype.zones;
  const all = archetype.runs.map((spec) => ({ spec, metrics: metricsFor(spec, zones, archetype.rest, recalibration != null) }));
  const easyRuns = all.filter((entry) => entry.metrics.family === "easy");
  const easy: EasyBaseline | null = easyRuns.length ? { medianPaceS: median(easyRuns.map((entry) => entry.spec.paceS)) as number, medianHeartRateBpm: median(easyRuns.map((entry) => entry.spec.hr)) as number, runs: easyRuns.length, samples: easyRuns.map((entry) => ({ paceS: entry.spec.paceS, heartRateBpm: entry.spec.hr })) } : null;
  const perBeat = median(easyRuns.map((entry) => (1000 / entry.spec.paceS) / (entry.spec.hr - archetype.rest)));
  const longest = Math.max(...archetype.runs.map((run) => run.minutes * 60));
  const findings = all.flatMap(({ spec, metrics }) => {
    const prescription = prescribe({ metrics, zones, lactateThresholdSpeedMps: null, restingHeartRateBpm: archetype.rest, recentSpeedPerBeat: perBeat, movingTimeS: spec.minutes * 60, raceTargets: [], efforts: [], reference: null, context: null });
    return checkSession({
      register: "vous", zones, easy,
      session: { kind: metrics.kind, family: metrics.family, movingTimeS: spec.minutes * 60, mainHeartRateBpm: metrics.mainHeartRateBpm, longestBeforeS: longest === spec.minutes * 60 ? longest / 2 : longest },
      verdict: { level: "in_line", efficiencyTone: "neutral", efficiencyGainSPerKm: 0, spreadSPerKm: null },
      prescription,
      texts: [],
    });
  });
  return { zones, findings };
}

describe("profils types : chaîne complète du moteur, puis contrôleur de cohérence", () => {
  for (const archetype of ARCHETYPES) {
    it(`${archetype.name} : aucune erreur du contrôleur`, () => {
      const { findings } = runArchetype(archetype);
      expect(findings.filter((finding) => finding.severity === "error")).toEqual([]);
    });
  }

  it("entraîné, zones génériques : la Z2 est recalée et ses footings y tiennent", () => {
    const { zones, findings } = runArchetype(ARCHETYPES[0]);
    expect(zones.floors[2] - 1).toBeGreaterThanOrEqual(146);
    expect(findings.filter((finding) => finding.code === "z2_below_easy_runs")).toEqual([]);
  });

  it("sans recalage, le contrôleur aurait signalé le cas d'origine", () => {
    const archetype = ARCHETYPES[0];
    const zones = archetype.zones;
    const easyRuns = archetype.runs.filter((run) => run.label === "AEROBIC_BASE" && run.minutes < 75);
    const metrics = metricsFor(easyRuns[0], zones, archetype.rest, false);
    const perBeat = median(easyRuns.map((run) => (1000 / run.paceS) / (run.hr - archetype.rest)));
    const prescription = prescribe({ metrics, zones, lactateThresholdSpeedMps: null, restingHeartRateBpm: archetype.rest, recentSpeedPerBeat: perBeat, movingTimeS: 3000, raceTargets: [], efforts: [], reference: null, context: null });
    const findings = checkSession({ register: "vous", zones, easy: { medianPaceS: median(easyRuns.map((run) => run.paceS)) as number, medianHeartRateBpm: median(easyRuns.map((run) => run.hr)) as number, runs: easyRuns.length, samples: easyRuns.map((run) => ({ paceS: run.paceS, heartRateBpm: run.hr })) }, session: { kind: metrics.kind, family: metrics.family, movingTimeS: 3000, mainHeartRateBpm: metrics.mainHeartRateBpm, longestBeforeS: null }, verdict: { level: "in_line", efficiencyTone: "neutral", efficiencyGainSPerKm: 0, spreadSPerKm: null }, prescription, texts: [] });
    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["z2_below_easy_runs"]));
  });
});
