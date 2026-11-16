import { describe, expect, it } from "vitest";
import { classifySegmentRoles } from "./segment-roles";
import { assessSessionRegularity } from "./regularity";
import type { ActivitySegment } from "./types";

const THRESHOLD_MPS = 4.0;
const EASY_MPS = 3.2;

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

function roled(segments: ActivitySegment[]) {
  return classifySegmentRoles(segments, THRESHOLD_MPS).segments;
}

describe("assessSessionRegularity", () => {
  it("calcule la dégradation sur les segments work uniquement, en excluant warmup/cooldown", () => {
    const segments = [
      makeSegment(0, EASY_MPS, 300), // warmup
      makeSegment(1, 4.0, 300), // work (100% du seuil -> zone "threshold")
      makeSegment(2, EASY_MPS, 90), // recovery
      makeSegment(3, 3.6, 300), // work (90% du seuil -> zone "tempo"), plus lent -> dégradation
      makeSegment(4, EASY_MPS, 300), // cooldown
    ];

    const assessment = assessSessionRegularity(roled(segments));

    expect(assessment.basis).toBe("work_segments");
    expect(assessment.analyzedSegmentCount).toBe(2);
    // (4.0-3.6)/4.0*100 = 10%
    expect(assessment.secondHalfSlowdownPct).toBeCloseTo(10, 1);
    expect(assessment.firstVsLastSlowdownPct).toBeCloseTo(10, 1);
  });

  it("retombe sur l'ensemble de la séance quand aucun segment de travail n'est détecté (sortie continue)", () => {
    const segments = [
      makeSegment(0, EASY_MPS, 300),
      makeSegment(1, EASY_MPS - 0.3, 300),
      makeSegment(2, EASY_MPS - 0.6, 300),
    ];

    const assessment = assessSessionRegularity(roled(segments));

    expect(assessment.basis).toBe("full_session");
    expect(assessment.analyzedSegmentCount).toBe(3);
    expect(assessment.secondHalfSlowdownPct).toBeGreaterThan(0);
  });

  it("ne rapporte aucune dégradation sur une séance parfaitement régulière", () => {
    const segments = [makeSegment(0, 4.0, 300), makeSegment(1, EASY_MPS, 90), makeSegment(2, 4.0, 300), makeSegment(3, EASY_MPS, 90), makeSegment(4, 4.0, 300)];

    const assessment = assessSessionRegularity(roled(segments));

    expect(assessment.secondHalfSlowdownPct).toBeCloseTo(0, 5);
    expect(assessment.paceCoefficientOfVariation).toBeCloseTo(0, 5);
  });

  it("signale des données insuffisantes avec moins de 2 segments exploitables", () => {
    const assessment = assessSessionRegularity(roled([makeSegment(0, 4.0)]));
    expect(assessment.basis).toBe("insufficient");
    expect(assessment.secondHalfSlowdownPct).toBeNull();
  });
});
