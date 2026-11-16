import { describe, expect, it } from "vitest";
import { buildSessionSignature, computeComparability, getWorkRepBucket, type SessionSignature } from "./session-signature";
import type { ActivitySegment, SegmentationResult } from "./types";

const THRESHOLD_MPS = 4.0;
const WALK_MPS = 1.8;
const EASY_MPS = 3.2;
const THRESHOLD_ZONE_MPS = 3.9;

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

function segmentation(segments: ActivitySegment[]): SegmentationResult {
  return { strategy: "adaptive", segments, limitations: [] };
}

function intervalledFixture(): ActivitySegment[] {
  return [
    makeSegment(0, THRESHOLD_ZONE_MPS, 300),
    makeSegment(1, WALK_MPS, 90),
    makeSegment(2, THRESHOLD_ZONE_MPS, 300),
    makeSegment(3, WALK_MPS, 90),
    makeSegment(4, THRESHOLD_ZONE_MPS, 300),
  ];
}

describe("getWorkRepBucket", () => {
  it("classe court/moyen/long selon les bornes documentées", () => {
    expect(getWorkRepBucket(60)).toBe("short");
    expect(getWorkRepBucket(150)).toBe("medium");
    expect(getWorkRepBucket(300)).toBe("long");
  });
});

describe("buildSessionSignature", () => {
  it("produit une signature measured pour une séance structurée avec un seuil exploitable", () => {
    const signature = buildSessionSignature({
      activityId: "i1", activityDate: "2026-08-01T00:00:00.000Z", sportType: "Run",
      totalDistanceM: 8000, totalMovingTimeS: 2000, elevationGainM: 30,
      segmented: segmentation(intervalledFixture()), thresholdSpeedMps: THRESHOLD_MPS,
    });

    expect(signature.signatureQuality).toBe("measured");
    expect(signature.workSegmentCount).toBe(3);
    expect(signature.recoverySegmentCount).toBe(2);
    expect(signature.dominantZone).toBe("threshold");
    expect(signature.workDurationBucket).toBe("long");
    expect(signature.variationProfile.label).toBe("intervalled");
    expect(signature.workToRestRatio).toBeCloseTo(900 / 180, 5);
  });

  it("devient unavailable sans seuil exploitable, même si la structure est mesurable", () => {
    const signature = buildSessionSignature({
      activityId: "i1", activityDate: "2026-08-01T00:00:00.000Z", sportType: "Run",
      totalDistanceM: 8000, totalMovingTimeS: 2000, elevationGainM: null,
      segmented: segmentation(intervalledFixture()), thresholdSpeedMps: null,
    });

    expect(signature.signatureQuality).toBe("unavailable");
  });

  it("devient unavailable quand les rôles de segment ne sont pas fiables", () => {
    const signature = buildSessionSignature({
      activityId: "i1", activityDate: "2026-08-01T00:00:00.000Z", sportType: "Run",
      totalDistanceM: null, totalMovingTimeS: null, elevationGainM: null,
      segmented: segmentation([makeSegment(0, null), makeSegment(1, null)]), thresholdSpeedMps: THRESHOLD_MPS,
    });

    expect(signature.signatureQuality).toBe("unavailable");
    expect(signature.workSegmentCount).toBe(0);
  });

  it("devient unavailable pour une séance continue sans aucun segment de travail", () => {
    const signature = buildSessionSignature({
      activityId: "i1", activityDate: "2026-08-01T00:00:00.000Z", sportType: "Run",
      totalDistanceM: 8000, totalMovingTimeS: 2400, elevationGainM: 20,
      segmented: segmentation([makeSegment(0, EASY_MPS), makeSegment(1, EASY_MPS), makeSegment(2, EASY_MPS)]),
      thresholdSpeedMps: THRESHOLD_MPS,
    });

    expect(signature.signatureQuality).toBe("unavailable");
    expect(signature.workSegmentCount).toBe(0);
  });
});

function measuredSignature(overrides: Partial<SessionSignature> = {}): SessionSignature {
  return {
    activityId: "candidate", activityDate: "2026-07-01T00:00:00.000Z", sportType: "Run",
    totalDistanceM: 8000, totalMovingTimeS: 2000, elevationGainM: 30,
    workSegmentCount: 3, averageWorkSegmentDurationS: 300, workDurationBucket: "long", totalWorkDurationS: 900,
    dominantZone: "threshold", averagePercentOfThreshold: 97,
    recoverySegmentCount: 2, averageRecoveryDurationS: 90, workToRestRatio: 5,
    variationProfile: { label: "intervalled", confidence: "high", hasRecoveryOrWalkSegments: true },
    signatureQuality: "measured",
    ...overrides,
  };
}

describe("computeComparability", () => {
  it("exclut un candidat non mesuré", () => {
    expect(computeComparability(measuredSignature(), measuredSignature({ signatureQuality: "unavailable" }))).toBeNull();
  });

  it("exclut un candidat d’un autre sport", () => {
    expect(computeComparability(measuredSignature(), measuredSignature({ sportType: "WeightTraining" }))).toBeNull();
  });

  it("exclut un candidat sans segment de travail", () => {
    expect(computeComparability(measuredSignature(), measuredSignature({ workSegmentCount: 0 }))).toBeNull();
  });

  it("classe en tier high deux séances quasi identiques", () => {
    const result = computeComparability(measuredSignature(), measuredSignature());
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("high");
    expect(result!.guardrailsApplied).toEqual([]);
  });

  it("plafonne le tier à moderate quand le ratio travail/récupération diffère fortement malgré des fractions similaires", () => {
    const current = measuredSignature({ workToRestRatio: 5 });
    const candidate = measuredSignature({ workToRestRatio: 1 }); // ratio 5x > seuil de 2x
    const result = computeComparability(current, candidate);
    expect(result!.tier).toBe("moderate");
    expect(result!.guardrailsApplied).toContain("recovery_mismatch");
  });

  it("plafonne le tier à moderate quand le dénivelé par km diffère fortement", () => {
    const current = measuredSignature({ elevationGainM: 20, totalDistanceM: 8000 }); // 2.5 m/km
    const candidate = measuredSignature({ elevationGainM: 400, totalDistanceM: 8000 }); // 50 m/km
    const result = computeComparability(current, candidate);
    expect(result!.tier).toBe("moderate");
    expect(result!.guardrailsApplied).toContain("elevation_mismatch");
  });

  it("ignore les garde-fous quand la donnée manque d’un côté plutôt que de pénaliser", () => {
    const current = measuredSignature({ elevationGainM: null });
    const candidate = measuredSignature({ elevationGainM: 400 });
    const result = computeComparability(current, candidate);
    expect(result!.guardrailsApplied).not.toContain("elevation_mismatch");
  });

  it("dégrade le score sans l’annuler quand les zones sont seulement adjacentes", () => {
    const current = measuredSignature({ dominantZone: "threshold" });
    const candidate = measuredSignature({ dominantZone: "vo2max" });
    const result = computeComparability(current, candidate);
    expect(result!.breakdown.zoneMatch).toBe(0.5);
  });

  it("attribue une similarité neutre (0.5) plutôt qu’une pénalité quand le volume de travail est inconnu d’un côté", () => {
    const current = measuredSignature({ totalWorkDurationS: null });
    const candidate = measuredSignature();
    const result = computeComparability(current, candidate);
    expect(result!.breakdown.workVolumeSimilarity).toBe(0.5);
  });
});
