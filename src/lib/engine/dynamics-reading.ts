import type { ActivityMetrics } from "./activity-metrics";
import type { ComparisonDeltas } from "./comparable";

/**
 * Lecture en clair de la dynamique de course d'une séance : seulement les
 * écarts qui ressortent, par rapport à ses propres valeurs (début/fin de
 * l'effort, séances comparables). Jamais de norme universelle.
 */

const STEP_CM = 3;
const CADENCE_SPM = 3;
const GCT_MS = 10;
const OSCILLATION_MM = 4;

export function readDynamics(metrics: ActivityMetrics, deltas: ComparisonDeltas): string[] {
  const dynamics = metrics.dynamics;
  if (!dynamics) return [];
  const lines: string[] = [];
  const ref = deltas.dynamicsReference?.values;

  if (ref) {
    const stepDiff = dynamics.stepLengthM != null && ref.stepLengthM != null ? Math.round((dynamics.stepLengthM - ref.stepLengthM) * 100) : null;
    const cadenceDiff = dynamics.cadenceSpm != null && ref.cadenceSpm != null ? dynamics.cadenceSpm - ref.cadenceSpm : null;
    const where = dynamics.basis === "reps" ? "Sur les répétitions, " : "";
    if (stepDiff != null && Math.abs(stepDiff) >= STEP_CM && cadenceDiff != null && Math.abs(cadenceDiff) < CADENCE_SPM) {
      lines.push(`${where}pas ${Math.abs(stepDiff)} cm plus ${stepDiff < 0 ? "court" : "long"} que sur tes séances comparables, à cadence égale : c'est ${stepDiff < 0 ? "lui qui explique l'allure plus lente" : "lui qui apporte la vitesse en plus"}.`);
    } else if (cadenceDiff != null && Math.abs(cadenceDiff) >= CADENCE_SPM) {
      lines.push(`${where}cadence ${Math.abs(cadenceDiff)} pas/min plus ${cadenceDiff > 0 ? "élevée" : "basse"} que sur tes séances comparables${stepDiff != null && Math.abs(stepDiff) >= STEP_CM ? `, avec un pas ${Math.abs(stepDiff)} cm plus ${stepDiff < 0 ? "court" : "long"}` : ""}.`);
    }
    const gctDiff = dynamics.groundContactMs != null && ref.groundContactMs != null ? dynamics.groundContactMs - ref.groundContactMs : null;
    if (gctDiff != null && Math.abs(gctDiff) >= GCT_MS) lines.push(`Contact au sol ${Math.abs(gctDiff)} ms plus ${gctDiff > 0 ? "long" : "court"} que d'habitude sur ce type de séance.`);
  }

  const early = dynamics.early;
  const late = dynamics.late;
  const span = dynamics.basis === "reps" ? "de la première à la dernière répétition" : "entre les deux moitiés";
  const fatigue: string[] = [];
  if (early.groundContactMs != null && late.groundContactMs != null && late.groundContactMs - early.groundContactMs >= 8) fatigue.push(`contact au sol +${late.groundContactMs - early.groundContactMs} ms`);
  if (early.cadenceSpm != null && late.cadenceSpm != null && early.cadenceSpm - late.cadenceSpm >= CADENCE_SPM) fatigue.push(`cadence −${early.cadenceSpm - late.cadenceSpm} pas/min`);
  if (early.verticalOscillationMm != null && late.verticalOscillationMm != null && late.verticalOscillationMm - early.verticalOscillationMm >= OSCILLATION_MM) fatigue.push(`oscillation +${late.verticalOscillationMm - early.verticalOscillationMm} mm`);
  // Un seul indicateur qui bouge ne suffit pas à parler de fatigue : il en faut deux.
  if (fatigue.length >= 2) lines.push(`Foulée qui se dégrade ${span} (${fatigue.join(", ")}) : signe de fatigue en fin d'effort.`);
  else if (fatigue.length === 1) lines.push(`Légère évolution ${span} (${fatigue[0]}), sans autre signe de fatigue de foulée.`);
  else if (early.groundContactMs != null && late.groundContactMs != null) lines.push(`Foulée stable ${span}${early.cadenceSpm != null && late.cadenceSpm != null ? ` (cadence ${early.cadenceSpm} → ${late.cadenceSpm} pas/min, contact au sol ${early.groundContactMs} → ${late.groundContactMs} ms)` : ""}.`);

  return lines;
}
