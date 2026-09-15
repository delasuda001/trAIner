import { z } from "zod";

/**
 * Durées de référence pour les meilleurs efforts glissants (en secondes).
 */
const REFERENCE_DURATIONS_S = [180, 300, 600, 1200, 1800];

/**
 * Seuils minimaux de FC relative par durée (fraction de FC max observée).
 * Décroissants avec la durée de l'effort.
 */
const MIN_HR_RATIO_BY_DURATION_S: Record<number, number> = {
  180: 0.90,   // 3 min : 90%
  300: 0.88,   // 5 min : 88%
  600: 0.85,   // 10 min : 85%
  1200: 0.80,  // 20 min : 80%
  1800: 0.78,  // 30 min : 78%
};

/**
 * Exposant de fatigue attendu selon le modèle Riegel.
 * La vitesse dégradée attendue entre deux efforts est inversement
 * proportionnelle à (duration2 / duration1)^FATIGUE_EXPONENT.
 */
const FATIGUE_EXPONENT = 0.075;

/**
 * Tolérance de dégradation admissible au-delà de celle attendue.
 * Une dégradation réelle > attendue × (1 + DEGRADATION_TOLERANCE) signale
 * un effort non maximal et est rejetée.
 */
const DEGRADATION_TOLERANCE = 0.15;

/**
 * Fenêtre de fraîcheur : si tous les points valides datent de plus de cette
 * durée (secondes), une alerte de fraîcheur est levée.
 */
const FRESHNESS_WINDOW_S = 8 * 7 * 24 * 3600; // 8 semaines

/**
 * Zones de durée représentatives.
 */
type DurationZone = "short" | "medium" | "long";

const DURATION_ZONES: Record<DurationZone, { min: number; max: number; label: string; suggestion: string }> = {
  short: {
    min: 0,
    max: 300,
    label: "Court (3-5 min, VO2max)",
    suggestion: "Fractionné court à sensation très difficile (30-60s × 6-12 rép.)",
  },
  medium: {
    min: 300,
    max: 1200,
    label: "Moyen (10-20 min, seuil)",
    suggestion: "Fractionné seuil ou tempo long (3-8 min × 4-6 rép.)",
  },
  long: {
    min: 1200,
    max: Infinity,
    label: "Long (30 min+, tempo)",
    suggestion: "Sortie en endurance de base ou tempo durable (30-90 min)",
  },
};

/**
 * Niveaux de confiance pour l'estimation de seuil.
 */
export type ConfidenceLevel = "insufficient" | "low" | "moderate" | "good";

/**
 * Résultat partiel d'un meilleur effort validé ou rejeté.
 */
interface BestEffortPoint {
  durationS: number;
  distanceM: number;
  heartRateBpm: number | null;
  activityId: string;
  durationZone: DurationZone;
  dateS: number; // timestamp secondes depuis époque
}

/**
 * Motif de rejet d'un point.
 */
interface RejectionReason {
  durationS: number;
  reason: string;
  durationZone: DurationZone;
}

/**
 * Résultat d'estimation de seuil.
 */
export interface ThresholdEstimate {
  criticalSpeedMps: number | null;
  dprimM: number | null;
  validPointCount: number;
  confidenceLevel: ConfidenceLevel;
  coverageByZone: Record<DurationZone, boolean>;
  missingZones: DurationZone[];
  sessionSuggestionsForMissingZones: string[];
  biasIndicator: string | null; // ex. "basée uniquement sur efforts courts"
  freshnessAlert: boolean;
  /** Nombre de points retenus dont l'effort source date de plus de FRESHNESS_WINDOW_S. */
  stalePointCount: number;
  /** Âge (semaines, 1 décimale) du plus ancien point retenu ; null si aucun point retenu. */
  oldestRetainedPointWeeks: number | null;
  rejectedPoints: RejectionReason[];
}

/**
 * Point d'entrée contenant les meilleurs efforts observés sur un intervalle.
 */
export interface ThresholdInput {
  effortsByDuration: Array<{
    durationS: number;
    distanceM: number;
    heartRateBpm: number | null;
    activityId: string;
    dateS: number;
  }>;
  globalMaxHeartRateBpm: number | null;
}

/**
 * Regroupe les tests d'un point candidat et retourne true s'il est valide.
 */
function isValidPoint(
  point: BestEffortPoint,
  globalMaxHr: number | null,
  lastValidByDuration: Map<number, { speed: number; dateS: number }>
): { valid: boolean; reason?: string } {
  // Test 1 : Intensité minimale relative (FC)
  if (globalMaxHr !== null && point.heartRateBpm !== null) {
    const minRatio = MIN_HR_RATIO_BY_DURATION_S[point.durationS];
    if (minRatio !== undefined) {
      const actualRatio = point.heartRateBpm / globalMaxHr;
      if (actualRatio < minRatio) {
        return {
          valid: false,
          reason: `FC relative ${(actualRatio * 100).toFixed(0)}% < seuil attendu ${(minRatio * 100).toFixed(0)}%`,
        };
      }
    }
  }

  // Test 2 : Plausibilité de dégradation.
  // On compare au point valide le plus proche PARMI toutes les durées
  // inférieures, pas seulement à la durée de référence immédiatement
  // précédente : sinon un trou (durée intermédiaire absente du cache ou
  // elle-même rejetée) désactive silencieusement ce contrôle et laisse
  // passer un effort long non maximal, qui tire ensuite la vitesse
  // critique vers le bas.
  const currentSpeed = point.distanceM / point.durationS;
  const previousDurationS = REFERENCE_DURATIONS_S
    .filter((d) => d < point.durationS)
    .reverse()
    .find((d) => lastValidByDuration.has(d));

  if (previousDurationS !== undefined) {
    const lastValid = lastValidByDuration.get(previousDurationS)!;
    // Allure attendue selon modèle de fatigue Riegel
    const durationRatio = point.durationS / previousDurationS;
    const expectedSpeedRatio = Math.pow(durationRatio, -FATIGUE_EXPONENT);
    const expectedSpeed = lastValid.speed * expectedSpeedRatio;

    // Dégradation réelle vs attendue
    const actualSlowdown = 1 - currentSpeed / expectedSpeed;
    const expectedSlowdown = 1 - expectedSpeedRatio;
    const maxAcceptableSlowdown = expectedSlowdown * (1 + DEGRADATION_TOLERANCE);

    if (actualSlowdown > maxAcceptableSlowdown) {
      return {
        valid: false,
        reason: `Dégradation d'allure ${(actualSlowdown * 100).toFixed(1)}% vs ${(expectedSlowdown * 100).toFixed(1)}% attendu face au meilleur effort de ${Math.round(previousDurationS / 60)} min — effort probablement non maximal`,
      };
    }
  }

  return { valid: true };
}

/**
 * Régression linéaire pour estimer la vitesse critique (CS) et la distance critique (D').
 * Modèle : distance = CS × temps + D'
 * Équation : CS = (n × Σ(t×d) - Σt×Σd) / (n × Σ(t²) - (Σt)²)
 */
function estimateCriticalSpeed(points: Array<{ t: number; d: number }>): { cs: number; dprime: number } {
  if (points.length < 2) {
    return { cs: 0, dprime: 0 };
  }

  const n = points.length;
  const sumT = points.reduce((s, p) => s + p.t, 0);
  const sumD = points.reduce((s, p) => s + p.d, 0);
  const sumTT = points.reduce((s, p) => s + p.t * p.t, 0);
  const sumTD = points.reduce((s, p) => s + p.t * p.d, 0);

  const denominator = n * sumTT - sumT * sumT;
  if (denominator === 0) {
    return { cs: 0, dprime: 0 };
  }

  const cs = (n * sumTD - sumT * sumD) / denominator;
  const dprime = (sumD - cs * sumT) / n;

  return { cs, dprime };
}

/**
 * Détermine les zones de durée couvertes par au moins un point valide,
 * en tenant compte de la fraîcheur des données (critère implicite de "récent").
 */
function assessCoverageByZone(validPoints: BestEffortPoint[]): Record<DurationZone, boolean> {
  const coverage: Record<DurationZone, boolean> = {
    short: false,
    medium: false,
    long: false,
  };

  for (const point of validPoints) {
    const zone = point.durationZone;
    coverage[zone] = true;
  }

  return coverage;
}

/**
 * Calcule le niveau de confiance en fonction du nombre de points valides
 * et de la couverture en zones.
 */
function assessConfidenceLevel(validPoints: BestEffortPoint[]): ConfidenceLevel {
  const count = validPoints.length;
  const coverage = assessCoverageByZone(validPoints);
  const coversAllZones = coverage.short && coverage.medium && coverage.long;

  if (count === 0 || count === 1) return "insufficient";
  if (count === 2) return "low";
  if (count === 3 || count === 4) return coversAllZones ? "moderate" : "low";
  if (count >= 5) return coversAllZones ? "good" : "moderate";

  return "low";
}

/**
 * Identifie les zones de durée non couvertes et génère des suggestions de séance.
 */
function suggestionsForMissingZones(missingZones: DurationZone[]): string[] {
  return missingZones.map((zone) => {
    const info = DURATION_ZONES[zone];
    return `${info.label} : ${info.suggestion}`;
  });
}

/**
 * Génère un indicateur de biais si l'estimation est basée sur une extrapolation.
 * Retourne null si le nombre de points n'est pas suffisant.
 */
function generateBiasIndicator(validPoints: BestEffortPoint[], confidenceLevel: ConfidenceLevel): string | null {
  if (validPoints.length < 2 || confidenceLevel === "insufficient") return null;

  const coverage = assessCoverageByZone(validPoints);
  const hasShort = coverage.short;
  const hasMedium = coverage.medium;
  const hasLong = coverage.long;

  // Si seulement efforts courts : CS peut être surévaluée
  if (hasShort && !hasMedium && !hasLong) {
    return "Basée uniquement sur des efforts courts : l'allure seuil réelle est probablement légèrement plus rapide";
  }
  // Si seulement efforts longs : CS peut être sous-évaluée
  if (hasLong && !hasShort && !hasMedium) {
    return "Basée uniquement sur des efforts longs : l'allure seuil réelle est probablement légèrement plus lente";
  }

  return null;
}

/**
 * Vérifie la fraîcheur des données : alerte levée si aucun point valide
 * n'est récent (< FRESHNESS_WINDOW_S secondes).
 */
function assessFreshness(validPoints: BestEffortPoint[], nowS: number): boolean {
  if (validPoints.length === 0) return true; // Pas de données du tout

  const recentThresholdS = nowS - FRESHNESS_WINDOW_S;
  const hasRecentData = validPoints.some((p) => p.dateS >= recentThresholdS);

  return !hasRecentData; // true = alerte levée
}

/**
 * Estime le seuil (allure critique et D') à partir d'une liste de meilleurs efforts.
 * Applique filtrage par FC relative et plausibilité de dégradation,
 * retourne confiance, couverture, suggestions et alertes.
 */
export function estimateThreshold(input: ThresholdInput): ThresholdEstimate {
  const now = Math.floor(Date.now() / 1000);
  const globalMaxHr = input.globalMaxHeartRateBpm;

  // Organiser les efforts par durée, classer en zones
  const effortsByDuration = new Map<number, BestEffortPoint>();
  for (const effort of input.effortsByDuration) {
    const durationZone = Object.entries(DURATION_ZONES).find(
      ([, zone]) => effort.durationS >= zone.min && effort.durationS < zone.max
    )?.[0] as DurationZone;

    effortsByDuration.set(effort.durationS, {
      durationS: effort.durationS,
      distanceM: effort.distanceM,
      heartRateBpm: effort.heartRateBpm,
      activityId: effort.activityId,
      durationZone,
      dateS: effort.dateS,
    });
  }

  // Filtrer les points valides en appliquant les deux critères
  const validPoints: BestEffortPoint[] = [];
  const rejectedPoints: RejectionReason[] = [];
  const lastValidByDuration = new Map<number, { speed: number; dateS: number }>();

  for (const durationS of REFERENCE_DURATIONS_S) {
    const point = effortsByDuration.get(durationS);
    if (!point) continue;

    const validation = isValidPoint(point, globalMaxHr, lastValidByDuration);
    if (validation.valid) {
      validPoints.push(point);
      lastValidByDuration.set(durationS, {
        speed: point.distanceM / point.durationS,
        dateS: point.dateS,
      });
    } else {
      rejectedPoints.push({
        durationS,
        reason: validation.reason || "Raison inconnue",
        durationZone: point.durationZone,
      });
    }
  }

  // Estimer vitesse critique et D'
  const regressionPoints = validPoints.map((p) => ({
    t: p.durationS,
    d: p.distanceM,
  }));
  const { cs, dprime } = estimateCriticalSpeed(regressionPoints);

  // Évaluer confiance et couverture
  const confidenceLevel = assessConfidenceLevel(validPoints);
  const coverage = assessCoverageByZone(validPoints);
  const missingZones = (Object.keys(DURATION_ZONES) as DurationZone[]).filter((z) => !coverage[z]);
  const sessionSuggestions = suggestionsForMissingZones(missingZones);
  const biasIndicator = generateBiasIndicator(validPoints, confidenceLevel);
  const freshnessAlert = assessFreshness(validPoints, now);

  const staleThresholdS = now - FRESHNESS_WINDOW_S;
  const stalePointCount = validPoints.filter((point) => point.dateS < staleThresholdS).length;
  const oldestDateS = validPoints.length > 0 ? Math.min(...validPoints.map((point) => point.dateS)) : null;
  const oldestRetainedPointWeeks = oldestDateS != null
    ? Math.round(((now - oldestDateS) / (7 * 24 * 3600)) * 10) / 10
    : null;

  return {
    criticalSpeedMps: validPoints.length >= 2 ? cs : null,
    dprimM: validPoints.length >= 2 ? dprime : null,
    validPointCount: validPoints.length,
    confidenceLevel,
    coverageByZone: coverage,
    missingZones,
    sessionSuggestionsForMissingZones: sessionSuggestions,
    biasIndicator,
    freshnessAlert,
    stalePointCount,
    oldestRetainedPointWeeks,
    rejectedPoints,
  };
}

/**
 * Schéma de validation Zod pour ThresholdEstimate.
 */
export const thresholdEstimateSchema = z.object({
  criticalSpeedMps: z.number().finite().nonnegative().nullable(),
  dprimM: z.number().finite().nullable(),
  validPointCount: z.number().int().nonnegative(),
  confidenceLevel: z.enum(["insufficient", "low", "moderate", "good"]),
  coverageByZone: z.object({
    short: z.boolean(),
    medium: z.boolean(),
    long: z.boolean(),
  }),
  missingZones: z.array(z.enum(["short", "medium", "long"])),
  sessionSuggestionsForMissingZones: z.array(z.string()),
  biasIndicator: z.string().nullable(),
  freshnessAlert: z.boolean(),
  stalePointCount: z.number().int().nonnegative(),
  oldestRetainedPointWeeks: z.number().nonnegative().nullable(),
  rejectedPoints: z.array(
    z.object({
      durationS: z.number().positive(),
      reason: z.string(),
      durationZone: z.enum(["short", "medium", "long"]),
    })
  ),
});
