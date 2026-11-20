import { describe, expect, it } from "vitest";
import { easyPaceRange } from "./easy-pace";

const sample = (paceS: number, heartRateBpm: number, localDate: string) => ({ paceS, heartRateBpm, localDate });

describe("allure facile tirée des footings réels", () => {
  it("footings courus à ces FC : fourchette autour de leur médiane, penchée vers le lent", () => {
    // Coureuse dont l'allure bouge peu avec la FC : le modèle (7:15–7:43) était 50 s/km trop lent.
    const samples = [sample(428, 149, "2026-08-22"), sample(391, 149, "2026-10-24"), sample(387, 142, "2026-10-31")];
    expect(easyPaceRange({ fastS: 435, slowS: 463 }, { heartRateLow: 137, heartRateHigh: 149 }, samples)).toEqual({ fastS: 388, slowS: 408 });
  });

  it("6 dernières semaines d'abord", () => {
    const samples = [sample(430, 140, "2026-08-01"), sample(432, 141, "2026-08-08"), sample(431, 142, "2026-08-15"), sample(380, 140, "2026-10-20"), sample(385, 141, "2026-10-27"), sample(382, 142, "2026-11-03")];
    const range = easyPaceRange(null, { heartRateLow: 136, heartRateHigh: 148 }, samples);
    expect(range && range.fastS < 380 && range.slowS < 405).toBe(true);
  });

  it("trop peu de footings dans la plage : modèle, borné à 30 s/km au-dessus de leur allure médiane", () => {
    const samples = [sample(400, 130, "2026-10-01"), sample(410, 128, "2026-10-08"), sample(405, 131, "2026-10-15")];
    expect(easyPaceRange({ fastS: 450, slowS: 478 }, { heartRateLow: 140, heartRateHigh: 148 }, samples)).toEqual({ fastS: 407, slowS: 435 });
    expect(easyPaceRange({ fastS: 380, slowS: 400 }, { heartRateLow: 140, heartRateHigh: 148 }, samples)).toEqual({ fastS: 380, slowS: 400 });
    expect(easyPaceRange({ fastS: 450, slowS: 478 }, { heartRateLow: 140, heartRateHigh: 148 }, [])).toEqual({ fastS: 450, slowS: 478 });
  });
});
