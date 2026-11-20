import { describe, expect, it } from "vitest";
import type { HeartRateZones } from "@/lib/source/types";
import type { Prescription } from "@/lib/engine/prescription";
import { checkClassification, checkEasyTargets, checkProgressionCue, checkRangeClaims, checkSession, checkText, checkVerdict, easyTargetOf } from "./coherence";

const generic: HeartRateZones = { floors: [96, 115, 134, 154, 173], maxHeartRateBpm: 192, lactateThresholdHeartRateBpm: null, method: "HR_MAX" };
const easy = { medianPaceS: 310, medianHeartRateBpm: 142, runs: 11 };

function easyPrescription(paceSlowS: number): Prescription {
  const target = { label: "endurance Z2", paceFastS: paceSlowS - 27, paceSlowS, heartRateLow: 115, heartRateHigh: 133, zone: "Z2" };
  return { status: "ok", target, goal: null, shouldHave: [], keep: null, next: { format: "45 min", target, recoveryS: null, cue: "Endurance de 45 min entre 115 et 133 bpm." } };
}

describe("consignes faciles face aux footings de la personne", () => {
  it("cas d'origine : Z2 générique sous ses footings et allure facile une minute plus lente", () => {
    const findings = checkEasyTargets({ zones: generic, easy, easyTarget: easyTargetOf(easyPrescription(405)) });
    expect(findings.map((finding) => finding.code)).toEqual(["z2_below_easy_runs", "easy_pace_far_slower"]);
    expect(findings[1].message).toContain("95 s/km plus lent");
  });

  it("zones recalées et allure cohérente : rien", () => {
    const recalibrated: HeartRateZones = { ...generic, floors: [96, 130, 149, 154, 173] };
    expect(checkEasyTargets({ zones: recalibrated, easy, easyTarget: easyTargetOf(easyPrescription(333)) })).toEqual([]);
  });

  it("pas de jugement avec moins de 5 footings", () => {
    expect(checkEasyTargets({ zones: generic, easy: { ...easy, runs: 3 }, easyTarget: easyTargetOf(easyPrescription(405)) })).toEqual([]);
  });
});

describe("type de séance", () => {
  it("2 h classées seuil, seuil sous la Z3, facile en Z4", () => {
    expect(checkClassification({ zones: generic, session: { kind: "threshold", family: "steady", movingTimeS: 121 * 60, mainHeartRateBpm: 171, longestBeforeS: null } })[0].code).toBe("long_effort_as_quality");
    expect(checkClassification({ zones: generic, session: { kind: "threshold", family: "steady", movingTimeS: 50 * 60, mainHeartRateBpm: 130, longestBeforeS: null } })[0].code).toBe("threshold_below_z3");
    expect(checkClassification({ zones: generic, session: { kind: "endurance", family: "easy", movingTimeS: 50 * 60, mainHeartRateBpm: 160, longestBeforeS: null } })[0].code).toBe("easy_in_z4");
    expect(checkClassification({ zones: generic, session: { kind: "long", family: "long", movingTimeS: 121 * 60, mainHeartRateBpm: 171, longestBeforeS: null } })).toEqual([]);
  });
});

describe("consigne « plus long » après un effort exceptionnel", () => {
  it("signalée au-delà de 1,5 fois la plus longue sortie des 12 semaines", () => {
    const base = easyPrescription(300);
    if (base.status !== "ok") throw new Error("consigne attendue");
    const prescription: Prescription = { ...base, next: { ...base.next, format: "125 min", cue: "Même effort à 154–172 bpm, prolongé à 125 min." } };
    expect(checkProgressionCue({ session: { kind: "threshold", family: "steady", movingTimeS: 121 * 60, mainHeartRateBpm: 170, longestBeforeS: 71 * 60 }, prescription })).toHaveLength(1);
    expect(checkProgressionCue({ session: { kind: "threshold", family: "steady", movingTimeS: 121 * 60, mainHeartRateBpm: 170, longestBeforeS: 110 * 60 }, prescription })).toEqual([]);
  });
});

describe("verdict dans le bruit", () => {
  it("seulement quand c'est le signal d'allure qui décide", () => {
    expect(checkVerdict({ verdict: { level: "below", efficiencyTone: "watch", efficiencyGainSPerKm: -7, spreadSPerKm: 21 } })).toHaveLength(1);
    expect(checkVerdict({ verdict: { level: "above", efficiencyTone: "neutral", efficiencyGainSPerKm: 9, spreadSPerKm: 19 } })).toEqual([]);
  });
});

describe("textes", () => {
  it("comparaison à une plage : fausse quand la valeur est dedans", () => {
    expect(checkRangeClaims("Seule cause possible retenue : une VFC de 64 ms, sous votre plage habituelle (60–76 ms).", "analyse")).toHaveLength(1);
    expect(checkRangeClaims("VFC à 54 ms, sous votre plage habituelle de 59–76 ms.", "analyse")).toEqual([]);
    expect(checkRangeClaims("VFC de 65 ms dans votre plage habituelle (58–74 ms).", "analyse")).toEqual([]);
    expect(checkRangeClaims("VFC de 80 ms dans votre plage habituelle (58–74 ms).", "analyse")).toHaveLength(1);
  });

  it("registre, élision, gabarit", () => {
    expect(checkText("Vous cours toute l'année.", "niveau", "vous")[0].code).toBe("register_conjugation");
    expect(checkText("Garde le cap.", "consigne", "vous")[0].code).toBe("register_tutoiement");
    expect(checkText("Garde le cap.", "consigne", "tu")).toEqual([]);
    expect(checkText("Gardez cette régularité de effort.", "analyse", "vous")[0].code).toBe("missing_elision");
    expect(checkText("Allure cible undefined/km.", "consigne", "tu")[0].code).toBe("template_leftover");
    expect(checkText("Courez 45 min entre 130 et 148 bpm, d'un effort régulier.", "consigne", "vous")).toEqual([]);
  });

  it("checkSession dédoublonne", () => {
    const findings = checkSession({ register: "vous", zones: generic, easy, session: { kind: "endurance", family: "easy", movingTimeS: 3000, mainHeartRateBpm: 141, longestBeforeS: 3600 }, verdict: { level: "in_line", efficiencyTone: "neutral", efficiencyGainSPerKm: 0, spreadSPerKm: 10 }, prescription: easyPrescription(405), texts: [{ where: "a", text: "de effort" }, { where: "a", text: "de effort" }] });
    expect(findings.filter((finding) => finding.code === "missing_elision")).toHaveLength(1);
  });
});
