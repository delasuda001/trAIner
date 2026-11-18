import { describe, expect, it } from "vitest";
import { zonesFromHistory, zonesSourceSentence } from "./zones";

const today = "2026-11-18";

describe("zonesFromHistory", () => {
  it("prend la 3e FC max la plus haute sur 2 ans (les pics isolés ne comptent pas)", () => {
    const runs = [199, 186, 184, 180, 178, 230].map((max, index) => ({ localDate: `2026-0${index + 1}-10`, maxHeartRateBpm: max }));
    const zones = zonesFromHistory(runs, today);
    expect(zones?.maxHeartRateBpm).toBe(184);
    expect(zones?.method).toBe("OBSERVED_MAX_HR");
    expect(zones?.floors).toEqual([92, 125, 145, 156, 166]);
  });

  it("ignore les courses de plus de 2 ans et refuse de conclure sous 5 courses", () => {
    const runs = [{ localDate: "2022-01-01", maxHeartRateBpm: 199 }, ...[170, 168, 165, 160].map((max) => ({ localDate: "2026-10-01", maxHeartRateBpm: max }))];
    expect(zonesFromHistory(runs, today)).toBeNull();
  });

  it("un coureur plus âgé obtient des zones plus basses : rien de fixe", () => {
    const runs = [168, 166, 165, 160, 158].map((max) => ({ localDate: "2026-10-01", maxHeartRateBpm: max }));
    expect(zonesFromHistory(runs, today)?.floors[1]).toBe(112);
  });
});

describe("zonesSourceSentence", () => {
  it("montre : seuil à la limite Z4/Z5 quand la Z5 commence juste sous le seuil", () => {
    const zones = { floors: [110, 128, 149, 159, 167] as [number, number, number, number, number], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" };
    expect(zonesSourceSentence(zones, "watch")).toBe("Zones de ta montre (seuil 169 bpm, à la limite Z4/Z5, FC max 189 bpm).");
  });
});
