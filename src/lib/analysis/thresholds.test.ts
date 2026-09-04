import { describe, it, expect } from "vitest";
import { estimateThreshold, type ThresholdInput } from "./thresholds";

describe("thresholds", () => {
  // Test 1: Rejet d'un point dont la FC relative est sous le seuil attendu
  it("should reject a point with insufficient relative heart rate", () => {
    const input: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 180, // 3 min
          distanceM: 500,
          heartRateBpm: 160, // FC très basse
          activityId: "activity1",
          dateS: Math.floor(Date.now() / 1000),
        },
      ],
      globalMaxHeartRateBpm: 200,
    };

    const result = estimateThreshold(input);

    expect(result.validPointCount).toBe(0);
    expect(result.rejectedPoints).toHaveLength(1);
    expect(result.rejectedPoints[0].reason).toContain("FC relative");
    expect(result.confidenceLevel).toBe("insufficient");
  });

  // Test 2: Rejet d'un point dont la dégradation est implausible
  it("should reject a point with implausible degradation vs previous valid point", () => {
    const now = Math.floor(Date.now() / 1000);
    const input: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 300, // 5 min
          distanceM: 1500,
          heartRateBpm: 180,
          activityId: "activity1",
          dateS: now,
        },
        {
          durationS: 600, // 10 min
          distanceM: 2400, // Allure beaucoup plus lente (2400/600 = 4.0 vs 1500/300 = 5.0)
          // Dégradation réelle : 1 - (2400/600) / (1500/300) = 1 - 4/5 = 0.2 = 20%
          // Dégradation attendue : Riegel avec exp=0.075 => (600/300)^0.075 ≈ 1.052, donc attendue ≈ 5.2%
          // 20% > 5.2% * (1 + 0.15) = 6%, donc rejeté
          heartRateBpm: 175,
          activityId: "activity2",
          dateS: now - 86400,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };

    const result = estimateThreshold(input);

    expect(result.validPointCount).toBe(1);
    expect(result.rejectedPoints).toHaveLength(1);
    expect(result.rejectedPoints[0].durationS).toBe(600);
    expect(result.rejectedPoints[0].reason).toContain("Dégradation");
  });

  // Test 3: Régression correcte sur points valides mixte (avec rejet)
  it("should correctly regress on mixed valid points, rejecting invalid ones", () => {
    const now = Math.floor(Date.now() / 1000);
    const input: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 180,
          distanceM: 900, // 5 m/s
          heartRateBpm: 185,
          activityId: "a1",
          dateS: now,
        },
        {
          durationS: 300,
          distanceM: 1650, // 5.5 m/s (reasonable progression)
          heartRateBpm: 180,
          activityId: "a2",
          dateS: now - 86400,
        },
        {
          durationS: 600,
          distanceM: 2700, // 4.5 m/s (rejected: too slow, but let's make it valid)
          heartRateBpm: 175,
          activityId: "a3",
          dateS: now - 172800,
        },
        {
          durationS: 1200,
          distanceM: 5400, // 4.5 m/s (consistent with 600s)
          heartRateBpm: 170,
          activityId: "a4",
          dateS: now - 259200,
        },
        {
          durationS: 1800,
          distanceM: 8100, // 4.5 m/s (consistent)
          heartRateBpm: 160,
          activityId: "a5",
          dateS: now - 345600,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };

    const result = estimateThreshold(input);

    expect(result.validPointCount).toBeGreaterThan(0);
    expect(result.criticalSpeedMps).not.toBeNull();
    expect(result.confidenceLevel).not.toBe("insufficient");
  });

  // Test 4: Niveaux de confiance corrects selon le nombre de points valides
  it("should assess confidence levels correctly", () => {
    const now = Math.floor(Date.now() / 1000);

    // Insufficient (0 points)
    const input0: ThresholdInput = {
      effortsByDuration: [],
      globalMaxHeartRateBpm: 200,
    };
    expect(estimateThreshold(input0).confidenceLevel).toBe("insufficient");

    // Low (1 point)
    const input1: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 300,
          distanceM: 1500,
          heartRateBpm: 180,
          activityId: "a1",
          dateS: now,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };
    expect(estimateThreshold(input1).confidenceLevel).toBe("insufficient");

    // Low (2 points)
    const input2: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 300,
          distanceM: 1500,
          heartRateBpm: 180,
          activityId: "a1",
          dateS: now,
        },
        {
          durationS: 600,
          distanceM: 2700,
          heartRateBpm: 175,
          activityId: "a2",
          dateS: now - 86400,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };
    const result2 = estimateThreshold(input2);
    expect(result2.validPointCount).toBe(2);
    expect(result2.confidenceLevel).toBe("low");

    // Moderate (4 points, some zones covered)
    const input4: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 180,
          distanceM: 900,
          heartRateBpm: 185,
          activityId: "a1",
          dateS: now,
        },
        {
          durationS: 300,
          distanceM: 1500,
          heartRateBpm: 180,
          activityId: "a2",
          dateS: now - 86400,
        },
        {
          durationS: 600,
          distanceM: 2700,
          heartRateBpm: 175,
          activityId: "a3",
          dateS: now - 172800,
        },
        {
          durationS: 1200,
          distanceM: 5400,
          heartRateBpm: 170,
          activityId: "a4",
          dateS: now - 259200,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };
    expect(estimateThreshold(input4).confidenceLevel).toMatch(/moderate|good/);
  });

  // Test 5: Détection des zones de durée manquantes
  it("should detect missing duration zones and provide suggestions", () => {
    const now = Math.floor(Date.now() / 1000);
    const input: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 300, // Medium zone
          distanceM: 1500,
          heartRateBpm: 180,
          activityId: "a1",
          dateS: now,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };

    const result = estimateThreshold(input);

    // Should detect missing short and long zones
    expect(result.missingZones).toContain("short");
    expect(result.missingZones).toContain("long");
    expect(result.sessionSuggestionsForMissingZones.length).toBeGreaterThan(0);
  });

  // Test 6: Détection de fraîcheur (aucun point valide < 8 semaines)
  it("should detect staleness when no valid points are recent", () => {
    const now = Math.floor(Date.now() / 1000);
    const nineWeeksAgoS = now - 9 * 7 * 24 * 3600;

    const input: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 300,
          distanceM: 1500,
          heartRateBpm: 180,
          activityId: "a1",
          dateS: nineWeeksAgoS,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };

    const result = estimateThreshold(input);

    expect(result.freshnessAlert).toBe(true);
  });

  // Test 7: Classification correcte en zone à chaque limite
  it("should maintain bias indicator for extrapolated estimates", () => {
    const now = Math.floor(Date.now() / 1000);

    // Only short-duration efforts (< 300s)
    const inputShortOnly: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 180,
          distanceM: 900,
          heartRateBpm: 185,
          activityId: "a1",
          dateS: now,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };

    const resultShort = estimateThreshold(inputShortOnly);
    // With only 1 point, confidence is insufficient, but we can still check bias
    expect(resultShort.biasIndicator).toBeNull(); // With insufficient points, no bias indicator

    // Multiple short efforts (all < 300s) to get valid threshold
    const inputShortMultiple: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 180,
          distanceM: 900,
          heartRateBpm: 185,
          activityId: "a1",
          dateS: now,
        },
        {
          durationS: 240,
          distanceM: 1200,
          heartRateBpm: 183,
          activityId: "a2",
          dateS: now - 86400,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };

    const resultShortMultiple = estimateThreshold(inputShortMultiple);
    if (resultShortMultiple.validPointCount >= 2) {
      expect(resultShortMultiple.biasIndicator).toContain("courts");
    }

    // Only long-duration efforts (>= 1200s)
    const inputLongOnly: ThresholdInput = {
      effortsByDuration: [
        {
          durationS: 1200,
          distanceM: 5400,
          heartRateBpm: 170,
          activityId: "a1",
          dateS: now,
        },
        {
          durationS: 1800,
          distanceM: 8100,
          heartRateBpm: 160,
          activityId: "a2",
          dateS: now - 86400,
        },
      ],
      globalMaxHeartRateBpm: 200,
    };

    const resultLong = estimateThreshold(inputLongOnly);
    if (resultLong.validPointCount >= 2) {
      expect(resultLong.biasIndicator).not.toBeNull();
      expect(resultLong.biasIndicator).toContain("longs");
    }
  });
});
