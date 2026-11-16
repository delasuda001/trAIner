import { describe, expect, it } from "vitest";
import { classifySegmentRoles } from "./segment-roles";
import { classifySessionVariationProfile } from "./variation-profile";
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

function roleAndClassify(segments: ActivitySegment[]) {
  const { segments: roled } = classifySegmentRoles(segments, THRESHOLD_MPS);
  return classifySessionVariationProfile(roled);
}

const WALK_MPS = 1.8; // ~45% du seuil : nettement sous la zone "easy"
const EASY_MPS = 3.2; // 80%
const THRESHOLD_ZONE_MPS = 3.9; // 97.5%
const VO2MAX_MPS = 4.3; // 107.5%

describe("classifySessionVariationProfile", () => {
  it("1. séance homogène à répétitions régulières -> intervalled", () => {
    const segments = [
      makeSegment(0, THRESHOLD_ZONE_MPS, 300),
      makeSegment(1, WALK_MPS, 90),
      makeSegment(2, THRESHOLD_ZONE_MPS, 300),
      makeSegment(3, WALK_MPS, 90),
      makeSegment(4, THRESHOLD_ZONE_MPS, 300),
      makeSegment(5, WALK_MPS, 90),
      makeSegment(6, THRESHOLD_ZONE_MPS, 300),
    ];

    const profile = roleAndClassify(segments);

    expect(profile.label).toBe("intervalled");
    expect(profile.confidence).toBe("high");
    expect(profile.hasRecoveryOrWalkSegments).toBe(true);
  });

  it("2. fartlek avec alternance volontaire mais hétérogène -> fartlek_like", () => {
    const segments = [
      makeSegment(0, THRESHOLD_ZONE_MPS, 90),
      makeSegment(1, EASY_MPS, 120),
      makeSegment(2, VO2MAX_MPS, 300),
      makeSegment(3, EASY_MPS, 200),
      makeSegment(4, THRESHOLD_ZONE_MPS, 500),
    ];

    const profile = roleAndClassify(segments);

    expect(profile.label).toBe("fartlek_like");
    expect(profile.confidence).toBe("moderate");
  });

  it("3. sortie progressive -> progressive, confiance haute", () => {
    const segments = [
      makeSegment(0, 3.0, 400),
      makeSegment(1, 3.2, 400),
      makeSegment(2, 3.4, 400),
      makeSegment(3, 3.6, 400),
      makeSegment(4, 3.9, 400),
    ];

    const profile = roleAndClassify(segments);

    expect(profile.label).toBe("progressive");
    expect(profile.confidence).toBe("high");
  });

  it("4. accélération brève en fin de sortie -> jamais confondue avec une progression continue", () => {
    const segments = [
      makeSegment(0, EASY_MPS, 300),
      makeSegment(1, EASY_MPS, 300),
      makeSegment(2, EASY_MPS, 300),
      makeSegment(3, EASY_MPS, 300),
      makeSegment(4, VO2MAX_MPS, 300),
    ];

    const profile = roleAndClassify(segments);

    expect(profile.label).not.toBe("progressive");
    expect(profile.label).toBe("technical_variation_possible");
    expect(profile.confidence).not.toBe("high"); // Décision finale B : jamais de confiance haute
  });

  it("sortie continue régulière -> steady", () => {
    const segments = [
      makeSegment(0, EASY_MPS, 400),
      makeSegment(1, EASY_MPS + 0.02, 400),
      makeSegment(2, EASY_MPS - 0.01, 400),
      makeSegment(3, EASY_MPS, 400),
    ];

    const profile = roleAndClassify(segments);

    expect(profile.label).toBe("steady");
    expect(profile.confidence).toBe("high");
    expect(profile.hasRecoveryOrWalkSegments).toBe(false);
  });

  it("données insuffisantes -> unknown, confiance basse", () => {
    const profile = roleAndClassify([makeSegment(0, EASY_MPS)]);
    expect(profile.label).toBe("unknown");
    expect(profile.confidence).toBe("low");
  });
});
