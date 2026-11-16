import type { RegularityAssessment } from "./regularity";
import type { VariationProfile, VariationProfileLabel } from "./variation-profile";

export type DebriefVerdict = "well_executed" | "partly_successful" | "miscalibrated" | "not_evaluable";

export type SessionIntentType =
  | "libre" | "facile" | "progressif" | "cadence_technique"
  | "fartlek" | "intervalles" | "cotes" | "sortie_longue" | "autre";

export type VerdictEvidenceMetric =
  | "pace_degradation_first_vs_second_half"
  | "pace_cv_work_segments"
  | "pace_delta_vs_comparable"
  | "declared_intent_contradiction"
  | "variation_profile_signal"
  | "not_evaluable_reason";

export type VerdictEvidenceItem = {
  metric: VerdictEvidenceMetric;
  currentValue: number;
  comparisonValue: number | null;
  unit: "%" | "s_per_km" | "bpm" | "ratio";
  /** Interprétation déterministe : jamais laissée au LLM. "n/a" quand il n'y a pas de valeur de comparaison. */
  direction: "higher" | "lower" | "equal" | "n/a";
  label: string;
};

export type VerdictHistoricalComparisonInput = {
  comparableActivitiesCount: number;
  /** > 0 = séance courante relativement plus intense (plus proche/au-dessus du seuil) que la comparable. */
  paceDeltaPct: number | null;
};

export type VerdictInput = {
  regularity: RegularityAssessment;
  variationProfile: VariationProfile;
  /** `null` = non renseignée (état normal — cf. plan §3.3, capture différée à un lot ultérieur). */
  sessionIntent: SessionIntentType | null;
  historicalComparison: VerdictHistoricalComparisonInput | null;
  thresholdConfidence: "insufficient" | "low" | "moderate" | "good";
};

export type VerdictResult = { verdict: DebriefVerdict; verdictEvidence: VerdictEvidenceItem[] };

/** Constantes initiales à valider sur des séances réelles avant mise en production (même statut que les autres seuils empiriques du module analysis). */
const SIGNIFICANT_SLOWDOWN_PCT = 5;
const NOTABLE_UNFAVORABLE_PACE_DELTA_PCT = -2;

const POSITIVE_VARIATION_LABELS: readonly VariationProfileLabel[] = ["progressive", "intervalled", "fartlek_like"];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function degradationEvidence(regularity: RegularityAssessment): VerdictEvidenceItem {
  const slowdown = regularity.secondHalfSlowdownPct ?? 0;
  return {
    metric: "pace_degradation_first_vs_second_half",
    currentValue: round1(slowdown),
    comparisonValue: null,
    unit: "%",
    direction: "n/a",
    label: `Deuxième moitié ${round1(Math.abs(slowdown))} % ${slowdown >= 0 ? "plus lente" : "plus rapide"} que la première.`,
  };
}

function cvEvidence(regularity: RegularityAssessment): VerdictEvidenceItem {
  const cvPct = (regularity.paceCoefficientOfVariation ?? 0) * 100;
  return {
    metric: "pace_cv_work_segments",
    currentValue: round1(cvPct),
    comparisonValue: null,
    unit: "%",
    direction: "n/a",
    label: `Variation d'allure de ${round1(cvPct)} % sur les segments analysés.`,
  };
}

const VARIATION_PROFILE_TEXT: Partial<Record<VariationProfileLabel, string>> = {
  progressive: "Progression continue d'allure du début à la fin, cohérente d'un bout à l'autre.",
  intervalled: "Répétitions travail/récupération régulières entre elles.",
  fartlek_like: "Alternance d'intensités constatée, compatible avec une séance volontairement variée.",
};

function variationEvidence(profile: VariationProfile): VerdictEvidenceItem {
  return {
    metric: "variation_profile_signal",
    currentValue: 1,
    comparisonValue: null,
    unit: "ratio",
    direction: "n/a",
    label: VARIATION_PROFILE_TEXT[profile.label] ?? "Variation d'intensité détectée dans la séance.",
  };
}

function paceDeltaEvidence(paceDeltaPct: number): VerdictEvidenceItem {
  return {
    metric: "pace_delta_vs_comparable",
    currentValue: round1(paceDeltaPct),
    comparisonValue: 0,
    unit: "%",
    direction: paceDeltaPct > 0 ? "higher" : paceDeltaPct < 0 ? "lower" : "equal",
    label: `${round1(Math.abs(paceDeltaPct))} % ${paceDeltaPct >= 0 ? "plus intense" : "moins intense"} (relativement au seuil) que les séances comparables récentes.`,
  };
}

function neutralEvidence(): VerdictEvidenceItem {
  return {
    metric: "pace_cv_work_segments",
    currentValue: 0,
    comparisonValue: null,
    unit: "%",
    direction: "n/a",
    label: "Aucun signal fort disponible au-delà du constat de base.",
  };
}

/**
 * Décision finale A : une intention seulement inférée à partir de la
 * structure détectée ne suffit jamais à établir une contradiction. Cette
 * fonction ne s'applique qu'à une intention EXPLICITEMENT déclarée par
 * l'utilisateur. `libre`/`autre` sont trop peu spécifiques pour juger une
 * contradiction et ne déclenchent jamais `miscalibrated`.
 */
function declaredIntentContradictsDegradation(intent: SessionIntentType): boolean {
  return intent !== "libre" && intent !== "autre";
}

/**
 * Classifie déterministiquement le verdict de niveau 1 du débrief. Le LLM
 * ne reçoit et ne produit jamais ce champ : il est calculé ici, côté
 * serveur, à partir de signaux mesurés — jamais choisi ou nuancé par le
 * modèle (cf. Décision D4 du plan).
 */
export function classifySessionVerdict(input: VerdictInput): VerdictResult {
  const { regularity, variationProfile, sessionIntent, historicalComparison, thresholdConfidence } = input;

  const hasRegularitySignal = regularity.basis !== "insufficient";
  const hasHistoricalSignal = historicalComparison != null && historicalComparison.comparableActivitiesCount > 0;

  if (!hasRegularitySignal && !hasHistoricalSignal && thresholdConfidence === "insufficient") {
    return {
      verdict: "not_evaluable",
      verdictEvidence: [
        {
          metric: "not_evaluable_reason",
          currentValue: 0,
          comparisonValue: null,
          unit: "ratio",
          direction: "n/a",
          label: "Ni régularité intra-séance ni comparaison historique exploitables : verdict non évaluable.",
        },
      ],
    };
  }

  const significantDegradation = regularity.secondHalfSlowdownPct != null && regularity.secondHalfSlowdownPct >= SIGNIFICANT_SLOWDOWN_PCT;

  // Décision finale A : `miscalibrated` exige une intention EXPLICITEMENT
  // déclarée, contredite par les données mesurées — jamais une intention
  // seulement inférée à partir de la structure détectée, même à haute confiance.
  if (significantDegradation && sessionIntent != null && declaredIntentContradictsDegradation(sessionIntent)) {
    return {
      verdict: "miscalibrated",
      verdictEvidence: [
        degradationEvidence(regularity),
        {
          metric: "declared_intent_contradiction",
          currentValue: 1,
          comparisonValue: null,
          unit: "ratio",
          direction: "n/a",
          label: `Intention déclarée (« ${sessionIntent} ») incompatible avec la dégradation mesurée en fin de séance.`,
        },
      ],
    };
  }

  // Décision finale B / point 2bis : un profil de variation détecté avec une
  // confiance suffisante (jamais `technical_variation_possible`, toujours
  // prudent) ne peut jamais faire retomber le verdict en dessous de
  // `partly_successful`, et peut soutenir `well_executed`.
  const structuredProfileSupportsPositive = POSITIVE_VARIATION_LABELS.includes(variationProfile.label) && variationProfile.confidence !== "low";

  if (significantDegradation && !structuredProfileSupportsPositive) {
    // Irrégularité mesurée sans intention déclarée contredite : jamais
    // `miscalibrated` (Décision finale A), au plus `partly_successful`.
    return { verdict: "partly_successful", verdictEvidence: [degradationEvidence(regularity)] };
  }

  const paceDeltaPct = historicalComparison?.paceDeltaPct ?? null;
  const historicalUnfavorable = paceDeltaPct != null && paceDeltaPct <= NOTABLE_UNFAVORABLE_PACE_DELTA_PCT;

  if (hasRegularitySignal && !historicalUnfavorable) {
    const evidence: VerdictEvidenceItem[] = [];
    if (structuredProfileSupportsPositive) evidence.push(variationEvidence(variationProfile));
    if (regularity.paceCoefficientOfVariation != null) evidence.push(cvEvidence(regularity));
    if (paceDeltaPct != null) evidence.push(paceDeltaEvidence(paceDeltaPct));
    if (evidence.length === 0) evidence.push(neutralEvidence());
    return { verdict: "well_executed", verdictEvidence: evidence };
  }

  return {
    verdict: "partly_successful",
    verdictEvidence: [paceDeltaPct != null ? paceDeltaEvidence(paceDeltaPct) : neutralEvidence()],
  };
}
