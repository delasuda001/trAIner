import { describe, it, expect } from "vitest";
import type { NormalizedStreams } from "@/lib/db/contracts";
import { computeStreamSummary, STREAM_SUMMARY_VERSION } from "./stream-summary";

/**
 * Construit un stream synthétique de `totalS` secondes (1 échantillon/s) :
 * vitesse `slowMps` sur la première moitié, `fastMps` sur la seconde.
 */
function buildStreams(totalS: number, slowMps: number, fastMps: number, withHr = true): NormalizedStreams {
  const elapsedTimeS: number[] = [];
  const distanceM: number[] = [];
  const heartRateBpm: Array<number | null> = [];
  let d = 0;
  for (let t = 0; t <= totalS; t += 1) {
    elapsedTimeS.push(t);
    distanceM.push(d);
    const inFastHalf = t >= totalS / 2;
    d += inFastHalf ? fastMps : slowMps;
    heartRateBpm.push(withHr ? (inFastHalf ? 172 : 150) : null);
  }
  return {
    activityId: "i-test",
    sampleCount: elapsedTimeS.length,
    elapsedTimeS,
    distanceM,
    heartRateBpm: withHr ? heartRateBpm : undefined,
    availability: { speed: false, heartRate: withHr, cadence: false, altitude: false, power: false },
    qualityWarnings: [],
  };
}

describe("computeStreamSummary", () => {
  it("extrait un meilleur effort par durée de référence couverte", () => {
    const summary = computeStreamSummary(buildStreams(2000, 3.0, 5.0));
    expect(summary.version).toBe(STREAM_SUMMARY_VERSION);
    expect(summary.sampleCount).toBe(2001);
    expect(summary.bestEfforts.map((effort) => effort.durationS)).toEqual([180, 300, 600, 1200, 1800]);
  });

  it("le meilleur effort court capte la portion rapide, le long est plus lent", () => {
    const summary = computeStreamSummary(buildStreams(2000, 3.0, 5.0));
    const short = summary.bestEfforts.find((effort) => effort.durationS === 180)!;
    const long = summary.bestEfforts.find((effort) => effort.durationS === 1800)!;
    expect(short.speedMps).toBeGreaterThan(4.8);
    expect(short.speedMps).toBeLessThanOrEqual(5.05);
    expect(long.speedMps).toBeLessThan(short.speedMps);
    expect(short.meanHeartRateBpm).toBeGreaterThan(160);
  });

  it("n'expose que des agrégats : aucune série brute, aucune donnée de localisation", () => {
    const summary = computeStreamSummary(buildStreams(700, 3.0, 4.0));
    expect(Object.keys(summary).sort()).toEqual(["bestEfforts", "computedAt", "sampleCount", "version"]);
    expect(JSON.stringify(summary)).not.toMatch(/latlng|latitude|longitude/i);
    // Aucune valeur du payload n'est un tableau de série (seul bestEfforts est un tableau, d'objets scalaires).
    for (const effort of summary.bestEfforts) {
      expect(Object.keys(effort).sort()).toEqual(["actualElapsedS", "distanceM", "durationS", "meanHeartRateBpm", "speedMps"]);
      for (const value of Object.values(effort)) expect(Array.isArray(value)).toBe(false);
    }
  });

  it("ne produit que les efforts que la durée totale permet", () => {
    const summary = computeStreamSummary(buildStreams(400, 3.0, 4.0));
    expect(summary.bestEfforts.map((effort) => effort.durationS)).toEqual([180, 300]);
  });

  it("retourne une liste vide sans série de distance", () => {
    const base = buildStreams(2000, 3.0, 5.0);
    const summary = computeStreamSummary({ ...base, distanceM: undefined });
    expect(summary.bestEfforts).toEqual([]);
    expect(summary.sampleCount).toBe(2001);
  });

  it("meanHeartRateBpm est null sans série de FC", () => {
    const summary = computeStreamSummary(buildStreams(700, 3.0, 4.0, false));
    expect(summary.bestEfforts.every((effort) => effort.meanHeartRateBpm === null)).toBe(true);
  });
});
