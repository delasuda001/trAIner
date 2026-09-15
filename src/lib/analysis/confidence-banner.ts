/**
 * Logique d'affichage pure pour l'estimation de seuil : elle décide de l'état
 * de bandeau/note à montrer et compose le message de péremption en français.
 *
 * Convention du projet : cette logique est extraite ici et testée
 * (`confidence-banner.test.ts`) ; les composants React qui la consomment
 * (`ThresholdProvenance`, `PerformanceProfilePanel`) ne sont pas testés
 * directement (cf. `docs/12-testing-strategy.md`).
 */

export type ThresholdConfidenceLevel = "insufficient" | "low" | "moderate" | "good";

/**
 * `insufficient` / `low`  -> bandeau alarmant « estimation peu fiable ».
 * `moderate-stale` / `good-stale` -> confiance correcte MAIS des points retenus
 *   ont plus de 8 semaines : note de péremption neutre, indépendante de la
 *   confiance (cas « confiance bonne + ancrage périmé »).
 * `moderate` / `good` -> rien de particulier.
 */
export type ConfidenceBannerState =
  | "insufficient"
  | "low"
  | "moderate-stale"
  | "good-stale"
  | "moderate"
  | "good";

export function selectConfidenceBannerState(input: {
  confidenceLevel: ThresholdConfidenceLevel;
  stalePointCount: number;
}): ConfidenceBannerState {
  if (input.confidenceLevel === "insufficient") return "insufficient";
  if (input.confidenceLevel === "low") return "low";
  const stale = input.stalePointCount > 0;
  if (input.confidenceLevel === "moderate") return stale ? "moderate-stale" : "moderate";
  return stale ? "good-stale" : "good";
}

/** true => bandeau alarmant (basse confiance). */
export function isAlarmingBanner(state: ConfidenceBannerState): boolean {
  return state === "insufficient" || state === "low";
}

/**
 * true => afficher la note de péremption neutre. Vraie uniquement pour les
 * états `*-stale` : en basse confiance, le message de péremption est déjà porté
 * par le bandeau alarmant, on ne le duplique pas.
 */
export function showsStalenessNote(state: ConfidenceBannerState): boolean {
  return state === "moderate-stale" || state === "good-stale";
}

/**
 * Message de péremption / d'insuffisance, en français. `null` quand tout va
 * bien (au moins 2 points retenus, aucun de plus de 8 semaines).
 * Partagé entre le contexte de débrief et le profil de performance.
 */
export function buildThresholdStaleMessage(input: {
  validPointCount: number;
  stalePointCount: number;
  oldestRetainedPointWeeks: number | null;
  windowWeeks: number;
}): string | null {
  if (input.validPointCount === 0) {
    return `Aucun effort maximal exploitable dans la fenêtre de ${input.windowWeeks} semaines.`;
  }
  if (input.stalePointCount > 0) {
    const oldest = input.oldestRetainedPointWeeks;
    return (
      `${input.stalePointCount} des ${input.validPointCount} efforts retenus datent de plus de 8 semaines` +
      (oldest != null ? ` (le plus ancien : ${oldest} semaines).` : ".")
    );
  }
  return null;
}
