import { describe, expect, it } from "vitest";
import type { Prescription } from "@/lib/engine/prescription";
import { gradeSessionOutput } from "./grade";

const zoneOf = (hr: number) => (hr >= 167 ? 5 : hr >= 159 ? 4 : hr >= 149 ? 3 : hr >= 128 ? 2 : 1);
const target = { label: "allure 5 km réaliste", paceFastS: 243, paceSlowS: 249, heartRateLow: 167, heartRateHigh: 180, zone: "Z5" };
const prescription: Prescription = { status: "ok", target, goal: null, shouldHave: ["Récupération : 2:02 pour 3:00 conseillées."], keep: null, next: { format: "3 × 2 km", target, recoveryS: 180, cue: "Même format 3 × 2 km à 4:03–4:09/km, récupération 3:00." } };
const payload = { consignes_moteur: { aurait_du: prescription.shouldHave, prochaine_fois: prescription.next.cue }, repetitions: "4:07/km, 4:09/km, 4:15/km, 168 bpm (Z5), charge 409, 1,6 fois" };

const good = {
  verdict: "En dessous de tes repères : répétitions à 4:09/km.",
  bullets: ["Répétitions à 4:07/km puis 4:15/km.", "FC 168 bpm (Z5).", "Charge 409, soit 1,6 fois ta moyenne."],
  keep: "Première répétition bien gérée.",
  shouldHave: "Prends 3:00 de récupération (tu as pris 2:02).",
  nextTime: "Refais 3 × 2 km à 4:03–4:09/km avec 3:00 de récupération.",
  detail: "Paragraphe d'analyse détaillée de la séance, assez long pour passer le schéma.",
};

describe("notation déterministe", () => {
  it("donne 100 à une analyse conforme", () => {
    expect(gradeSessionOutput({ output: good, payload, zoneOf, prescription }).score).toBe(100);
  });

  it("pénalise une consigne non chiffrée qui reprend un constat", () => {
    const grade = gradeSessionOutput({ output: { ...good, shouldHave: "Cause probable : les jambes étaient sans doute chargées." }, payload, zoneOf, prescription });
    expect(grade.checks.find((check) => check.key === "consigne_chiffree")?.pass).toBe(false);
    expect(grade.checks.find((check) => check.key === "pas_de_constat_dans_consigne")?.pass).toBe(false);
    expect(grade.score).toBeLessThan(80);
  });

  it("repère un chiffre inventé et une cible du moteur absente", () => {
    const grade = gradeSessionOutput({ output: { ...good, nextTime: "Refais 3 × 2 km à 4:01/km." }, payload, zoneOf, prescription });
    expect(grade.checks.find((check) => check.key === "chiffres_sources")?.detail).toContain("4:01");
    expect(grade.checks.find((check) => check.key === "consigne_moteur")?.pass).toBe(false);
  });

  it("accepte « rien à corriger » quand le moteur n'a rien relevé", () => {
    const quiet: Prescription = { ...prescription, shouldHave: [] } as Prescription;
    const grade = gradeSessionOutput({ output: { ...good, shouldHave: "Rien à corriger sur l'exécution." }, payload, zoneOf, prescription: quiet });
    expect(grade.checks.find((check) => check.key === "consigne_chiffree")?.pass).toBe(true);
  });
});
