import { describe, expect, it } from "vitest";
import { classifySegmentRoles } from "./segment-roles";
import type { ActivitySegment } from "./types";

const THRESHOLD_MPS = 4.0;

function makeSegment(index: number, speedMps: number | null, durationS = 300): ActivitySegment {
  return {
    lapId: `seg-${index}`,
    index,
    startElapsedTimeS: index * durationS,
    endElapsedTimeS: (index + 1) * durationS,
    durationS,
    distanceM: speedMps != null ? speedMps * durationS : null,
    averageSpeedMps: speedMps,
    medianSpeedMps: speedMps,
    averageHeartRateBpm: null,
    averageCadenceSpm: null,
    averageAltitudeM: null,
    altitudeVariationM: null,
    averagePowerW: null,
    availability: { speed: speedMps != null, heartRate: false, cadence: false, altitude: false, power: false },
    limitations: [],
  };
}

const EASY_MPS = 3.2; // 80% du seuil
const THRESHOLD_ZONE_MPS = 3.9; // 97.5% du seuil (zone "threshold")

describe("classifySegmentRoles", () => {
  it("attribue warmup/work/recovery/cooldown sur une séance fractionnée classique", () => {
    const segments = [
      makeSegment(0, EASY_MPS), // warmup
      makeSegment(1, THRESHOLD_ZONE_MPS), // work
      makeSegment(2, EASY_MPS), // recovery
      makeSegment(3, THRESHOLD_ZONE_MPS), // work
      makeSegment(4, EASY_MPS), // recovery
      makeSegment(5, THRESHOLD_ZONE_MPS), // work
      makeSegment(6, EASY_MPS), // recovery
      makeSegment(7, THRESHOLD_ZONE_MPS), // work
      makeSegment(8, EASY_MPS), // cooldown
    ];

    const result = classifySegmentRoles(segments, THRESHOLD_MPS);

    expect(result.segments.map((s) => s.role)).toEqual([
      "warmup", "work", "recovery", "work", "recovery", "work", "recovery", "work", "cooldown",
    ]);
    expect(result.confidence).toBe("high");
  });

  it("ne détecte aucun warmup quand la séance démarre directement en zone de travail", () => {
    const segments = [
      makeSegment(0, THRESHOLD_ZONE_MPS),
      makeSegment(1, EASY_MPS),
      makeSegment(2, THRESHOLD_ZONE_MPS),
    ];

    const result = classifySegmentRoles(segments, THRESHOLD_MPS);

    expect(result.segments[0].role).toBe("work");
    expect(result.segments[1].role).toBe("recovery");
    expect(result.segments[2].role).toBe("work");
  });

  it("retombe en confiance basse et rôles unknown quand la vitesse est absente partout", () => {
    const segments = [makeSegment(0, null), makeSegment(1, null), makeSegment(2, null)];

    const result = classifySegmentRoles(segments, THRESHOLD_MPS);

    expect(result.segments.every((s) => s.role === "unknown")).toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("ne classe pas en warmup un préfixe facile dépassant 20% de la durée totale", () => {
    const segments = [makeSegment(0, EASY_MPS, 2000), makeSegment(1, THRESHOLD_ZONE_MPS, 300)];

    const result = classifySegmentRoles(segments, THRESHOLD_MPS);

    expect(result.segments[0].role).toBe("unknown");
    expect(result.segments[1].role).toBe("work");
    // 1 segment sur 2 reste unknown (50% > 30%) -> confiance basse malgré 2 segments exploitables.
    expect(result.confidence).toBe("low");
  });

  it("traite une séance sans aucun segment de travail comme un cas continu (tous unknown)", () => {
    const segments = [makeSegment(0, EASY_MPS), makeSegment(1, EASY_MPS), makeSegment(2, EASY_MPS)];

    const result = classifySegmentRoles(segments, THRESHOLD_MPS);

    expect(result.segments.every((s) => s.role === "unknown")).toBe(true);
  });

  it("retourne une confiance basse avec un seul segment exploitable", () => {
    const segments = [makeSegment(0, THRESHOLD_ZONE_MPS)];

    const result = classifySegmentRoles(segments, THRESHOLD_MPS);

    expect(result.confidence).toBe("low");
  });
});
