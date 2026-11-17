import { describe, expect, it } from "vitest";
import type { Lap } from "@/lib/source/types";
import { compactLaps } from "./laps-view";

function lap(index: number, durationS: number, speedMps: number, heartRate: number): Lap {
  return { index, startOffsetS: 0, durationS, distanceM: speedMps * durationS, averageSpeedMps: speedMps, averageHeartRateBpm: heartRate, maxHeartRateBpm: heartRate + 4, averageCadenceSpm: 170, elevationGainM: 0, trigger: "manual" };
}

describe("compactLaps", () => {
  it("14 × 30/30 : échauffement, 14 répétitions, récupérations et retour au calme regroupés", () => {
    const laps = [lap(0, 698, 2.8, 139)];
    for (let rep = 0; rep < 14; rep += 1) {
      laps.push(lap(laps.length, 31, 4.7, 165));
      if (rep < 13) laps.push(lap(laps.length, 30, 1.9, 166));
    }
    laps.push(lap(laps.length, 642, 2.3, 144));
    const rows = compactLaps(laps, (entry) => (entry.averageSpeedMps ?? 0) > 4)!;
    expect(rows).toHaveLength(17);
    expect(rows.filter((row) => row.kind === "rep")).toHaveLength(14);
    const groups = rows.flatMap((row) => (row.kind === "group" ? [row.group] : []));
    expect(groups.map((group) => [group.label, group.count])).toEqual([["Échauffement", 1], ["Récupérations", 13], ["Retour au calme", 1]]);
    expect(groups[1].durationS).toBe(390);
    expect(groups[1].speedMps).toBeCloseTo(1.9);
    expect(groups[1].heartRateBpm).toBe(166);
  });

  it("sortie sans répétition : pas de vue réduite", () => {
    expect(compactLaps([lap(0, 360, 2.8, 135), lap(1, 360, 2.8, 136)], () => false)).toBeNull();
  });
});
