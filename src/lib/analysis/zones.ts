import { z } from "zod";

/**
 * Zones d'entraînement définies en pourcentage de l'allure seuil (vitesse critique).
 * Inspirées des zones Daniels/Coggan.
 */

export type TrainingZone = "recovery" | "easy" | "tempo" | "threshold" | "vo2max" | "anaerobic";

/**
 * Bornes en pourcentage de l'allure seuil (vitesse critique).
 * Structure : [minPercent, maxPercent[.
 */
const ZONE_BOUNDARIES: Record<TrainingZone, { min: number; max: number; label: string }> = {
  recovery: {
    min: 0,
    max: 75,
    label: "Récupération",
  },
  easy: {
    min: 75,
    max: 88,
    label: "Base / Endurance",
  },
  tempo: {
    min: 88,
    max: 95,
    label: "Tempo",
  },
  threshold: {
    min: 95,
    max: 102,
    label: "Seuil",
  },
  vo2max: {
    min: 102,
    max: 115,
    label: "VO2max",
  },
  anaerobic: {
    min: 115,
    max: Infinity,
    label: "Anaérobie / Répétition",
  },
};

/**
 * Classifie une allure (m/s) en zone d'entraînement,
 * en fonction de l'allure seuil estimée.
 *
 * @param speedMps Allure de segment (m/s)
 * @param thresholdSpeedMps Allure seuil estimée (m/s)
 * @returns Zone et pourcentage de l'allure seuil
 */
export function classifySegmentInZone(
  speedMps: number | null,
  thresholdSpeedMps: number | null
): { zone: TrainingZone | null; percentOfThreshold: number | null } {
  if (speedMps === null || thresholdSpeedMps === null || thresholdSpeedMps <= 0) {
    return { zone: null, percentOfThreshold: null };
  }

  const percent = (speedMps / thresholdSpeedMps) * 100;

  for (const [zoneName, boundary] of Object.entries(ZONE_BOUNDARIES)) {
    if (percent >= boundary.min && percent < boundary.max) {
      return { zone: zoneName as TrainingZone, percentOfThreshold: percent };
    }
  }

  // Fallback: si aucune borne trouvée (ne devrait pas arriver), retourner anaerobic
  return { zone: "anaerobic", percentOfThreshold: percent };
}

/**
 * Retourne le label lisible d'une zone.
 */
export function getZoneLabel(zone: TrainingZone): string {
  return ZONE_BOUNDARIES[zone].label;
}

/**
 * Retourne les bornes (min, max) en % de la zone.
 */
export function getZoneBoundaries(zone: TrainingZone): { min: number; max: number } {
  const boundary = ZONE_BOUNDARIES[zone];
  return { min: boundary.min, max: boundary.max };
}

/**
 * Schéma de validation Zod pour TrainingZone.
 */
export const trainingZoneSchema = z.enum(["recovery", "easy", "tempo", "threshold", "vo2max", "anaerobic"]);

/**
 * Schéma pour le résultat de classification.
 */
export const zoneClassificationSchema = z.object({
  zone: trainingZoneSchema.nullable(),
  percentOfThreshold: z.number().finite().nonnegative().nullable(),
});
