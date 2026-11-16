import { average, coefficientOfVariation } from "./variation-profile";
import type { RoledSegment } from "./segment-roles";

export type RegularityBasis = "work_segments" | "full_session" | "insufficient";

export type RegularityAssessment = {
  /** Nombre de segments réellement utilisés pour le calcul (cf. `basis`). */
  analyzedSegmentCount: number;
  paceCoefficientOfVariation: number | null;
  firstHalfAverageSpeedMps: number | null;
  secondHalfAverageSpeedMps: number | null;
  /** > 0 = la deuxième moitié est plus lente que la première (dégradation). */
  secondHalfSlowdownPct: number | null;
  /** > 0 = le dernier segment est plus lent que le premier. */
  firstVsLastSlowdownPct: number | null;
  /**
   * `work_segments` : séance structurée, calcul restreint aux segments
   * `role="work"` (échauffement/récupération/retour au calme exclus).
   * `full_session` : aucun segment `work` détecté (séance continue) — la
   * distinction warmup/cooldown n'étant alors pas mesurable non plus, le
   * calcul porte sur l'ensemble des segments valides plutôt que sur rien.
   * `insufficient` : moins de 2 segments exploitables dans les deux cas.
   */
  basis: RegularityBasis;
};

const MIN_SEGMENTS_FOR_REGULARITY = 2;

/**
 * Évalue la régularité/dégradation d'allure d'une séance à partir de ses
 * segments rôlés (segment-roles.ts). Sur une séance structurée, seuls les
 * segments `work` sont pris en compte — échauffement, récupération et
 * retour au calme ne doivent jamais polluer ce signal (cf. plan de
 * consolidation, point 2). Sur une séance continue (aucun `work` détecté),
 * le calcul porte sur l'ensemble des segments valides, faute de distinction
 * warmup/cooldown mesurable dans ce cas.
 */
export function assessSessionRegularity(roled: RoledSegment[]): RegularityAssessment {
  const workSegments = roled.filter((segment) => segment.role === "work" && segment.averageSpeedMps != null);
  const basisSegments = workSegments.length > 0 ? workSegments : roled.filter((segment) => segment.averageSpeedMps != null);
  const basis: RegularityBasis = workSegments.length > 0 ? "work_segments" : basisSegments.length > 0 ? "full_session" : "insufficient";

  if (basisSegments.length < MIN_SEGMENTS_FOR_REGULARITY) {
    return {
      analyzedSegmentCount: basisSegments.length,
      paceCoefficientOfVariation: null,
      firstHalfAverageSpeedMps: null,
      secondHalfAverageSpeedMps: null,
      secondHalfSlowdownPct: null,
      firstVsLastSlowdownPct: null,
      basis: "insufficient",
    };
  }

  const speeds = basisSegments.map((segment) => segment.averageSpeedMps as number);
  const midpoint = Math.max(1, Math.floor(speeds.length / 2));
  const firstHalf = speeds.slice(0, midpoint);
  const secondHalf = speeds.slice(midpoint).length > 0 ? speeds.slice(midpoint) : firstHalf;

  const firstHalfAverageSpeedMps = average(firstHalf);
  const secondHalfAverageSpeedMps = average(secondHalf);
  const secondHalfSlowdownPct = firstHalfAverageSpeedMps > 0 ? ((firstHalfAverageSpeedMps - secondHalfAverageSpeedMps) / firstHalfAverageSpeedMps) * 100 : null;

  const firstSpeed = speeds[0];
  const lastSpeed = speeds[speeds.length - 1];
  const firstVsLastSlowdownPct = firstSpeed > 0 ? ((firstSpeed - lastSpeed) / firstSpeed) * 100 : null;

  return {
    analyzedSegmentCount: basisSegments.length,
    paceCoefficientOfVariation: coefficientOfVariation(speeds),
    firstHalfAverageSpeedMps,
    secondHalfAverageSpeedMps,
    secondHalfSlowdownPct,
    firstVsLastSlowdownPct,
    basis,
  };
}
