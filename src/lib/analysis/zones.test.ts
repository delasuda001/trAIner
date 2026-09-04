import { describe, it, expect } from "vitest";
import { classifySegmentInZone, getZoneLabel, getZoneBoundaries, type TrainingZone } from "./zones";

describe("zones", () => {
  // Test basic zone classification at boundaries
  it("should classify speed correctly at all zone boundaries", () => {
    const thresholdSpeedMps = 5; // 5 m/s is threshold

    // Recovery zone: < 75% of threshold
    // 5 * 0.74 = 3.7 m/s
    const recoveryResult = classifySegmentInZone(3.7, thresholdSpeedMps);
    expect(recoveryResult.zone).toBe("recovery");
    expect(recoveryResult.percentOfThreshold).toBeCloseTo(74);

    // Easy zone: 75-88% of threshold
    // 5 * 0.80 = 4.0 m/s
    const easyResult = classifySegmentInZone(4.0, thresholdSpeedMps);
    expect(easyResult.zone).toBe("easy");
    expect(easyResult.percentOfThreshold).toBeCloseTo(80);

    // Tempo zone: 88-95% of threshold
    // 5 * 0.90 = 4.5 m/s
    const tempoResult = classifySegmentInZone(4.5, thresholdSpeedMps);
    expect(tempoResult.zone).toBe("tempo");
    expect(tempoResult.percentOfThreshold).toBeCloseTo(90);

    // Threshold zone: 95-102% of threshold
    // 5 * 0.99 = 4.95 m/s
    const thresholdResult = classifySegmentInZone(4.95, thresholdSpeedMps);
    expect(thresholdResult.zone).toBe("threshold");
    expect(thresholdResult.percentOfThreshold).toBeCloseTo(99);

    // VO2max zone: 102-115% of threshold
    // 5 * 1.10 = 5.5 m/s
    const vo2maxResult = classifySegmentInZone(5.5, thresholdSpeedMps);
    expect(vo2maxResult.zone).toBe("vo2max");
    expect(vo2maxResult.percentOfThreshold).toBeCloseTo(110);

    // Anaerobic zone: > 115% of threshold
    // 5 * 1.20 = 6.0 m/s
    const anaerobicResult = classifySegmentInZone(6.0, thresholdSpeedMps);
    expect(anaerobicResult.zone).toBe("anaerobic");
    expect(anaerobicResult.percentOfThreshold).toBeCloseTo(120);
  });

  // Test null handling
  it("should return null zone when speed or threshold is null", () => {
    const resultNullSpeed = classifySegmentInZone(null, 5);
    expect(resultNullSpeed.zone).toBeNull();
    expect(resultNullSpeed.percentOfThreshold).toBeNull();

    const resultNullThreshold = classifySegmentInZone(4, null);
    expect(resultNullThreshold.zone).toBeNull();
    expect(resultNullThreshold.percentOfThreshold).toBeNull();

    const resultBothNull = classifySegmentInZone(null, null);
    expect(resultBothNull.zone).toBeNull();
    expect(resultBothNull.percentOfThreshold).toBeNull();
  });

  // Test exact zone boundaries
  it("should handle exact boundary values correctly", () => {
    const thresholdSpeedMps = 10; // 10 m/s threshold

    // Exactly at 75% (recovery/easy boundary)
    const at75Result = classifySegmentInZone(7.5, thresholdSpeedMps);
    expect(at75Result.zone).toBe("easy");

    // Just below 75%
    const below75Result = classifySegmentInZone(7.499, thresholdSpeedMps);
    expect(below75Result.zone).toBe("recovery");

    // Exactly at 88% (easy/tempo boundary)
    const at88Result = classifySegmentInZone(8.8, thresholdSpeedMps);
    expect(at88Result.zone).toBe("tempo");

    // Exactly at 95% (tempo/threshold boundary)
    const at95Result = classifySegmentInZone(9.5, thresholdSpeedMps);
    expect(at95Result.zone).toBe("threshold");

    // Exactly at 102% (threshold/vo2max boundary)
    const at102Result = classifySegmentInZone(10.2, thresholdSpeedMps);
    expect(at102Result.zone).toBe("vo2max");

    // Just above 115% (vo2max/anaerobic boundary)
    const at115Result = classifySegmentInZone(11.50001, thresholdSpeedMps);
    expect(at115Result.zone).toBe("anaerobic");
  });

  // Test zone labels
  it("should return correct zone labels", () => {
    const zones: TrainingZone[] = ["recovery", "easy", "tempo", "threshold", "vo2max", "anaerobic"];
    
    for (const zone of zones) {
      const label = getZoneLabel(zone);
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
    }

    expect(getZoneLabel("recovery")).toBe("Récupération");
    expect(getZoneLabel("easy")).toBe("Base / Endurance");
    expect(getZoneLabel("tempo")).toBe("Tempo");
    expect(getZoneLabel("threshold")).toBe("Seuil");
    expect(getZoneLabel("vo2max")).toBe("VO2max");
    expect(getZoneLabel("anaerobic")).toBe("Anaérobie / Répétition");
  });

  // Test zone boundaries retrieval
  it("should return correct zone boundaries", () => {
    const recoveryBoundaries = getZoneBoundaries("recovery");
    expect(recoveryBoundaries.min).toBe(0);
    expect(recoveryBoundaries.max).toBe(75);

    const easyBoundaries = getZoneBoundaries("easy");
    expect(easyBoundaries.min).toBe(75);
    expect(easyBoundaries.max).toBe(88);

    const tempoB = getZoneBoundaries("tempo");
    expect(tempoB.min).toBe(88);
    expect(tempoB.max).toBe(95);

    const thresholdB = getZoneBoundaries("threshold");
    expect(thresholdB.min).toBe(95);
    expect(thresholdB.max).toBe(102);

    const vo2maxB = getZoneBoundaries("vo2max");
    expect(vo2maxB.min).toBe(102);
    expect(vo2maxB.max).toBe(115);

    const anaerobicB = getZoneBoundaries("anaerobic");
    expect(anaerobicB.min).toBe(115);
    expect(anaerobicB.max).toBe(Infinity);
  });

  // Test invalid threshold speed
  it("should handle zero or negative threshold speed", () => {
    const resultZero = classifySegmentInZone(4, 0);
    expect(resultZero.zone).toBeNull();
    expect(resultZero.percentOfThreshold).toBeNull();

    const resultNegative = classifySegmentInZone(4, -5);
    expect(resultNegative.zone).toBeNull();
    expect(resultNegative.percentOfThreshold).toBeNull();
  });
});
