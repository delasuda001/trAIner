import { formatDuration, formatNumber, formatPace, formatSigned } from "@/lib/formatters";
import type { LoadAlert, LoadSummary } from "./load";
import type { GoalGap } from "./goal-gap";
import type { Progression, ReferenceHrSource } from "./progression";
import type { RecoverySignals } from "./recovery";

/**
 * Phrases déterministes affichées quand Claude n'a pas (encore) commenté,
 * et sens de chaque indicateur. Pas de score de forme : des constats.
 */

export type Tone = "good" | "warning" | "critical" | "neutral";

export const PROGRESSION_LABELS: Record<Progression["state"], { label: string; tone: Tone }> = {
  progressing: { label: "En progression", tone: "good" },
  stable: { label: "Stable", tone: "neutral" },
  regressing: { label: "En recul", tone: "warning" },
  insufficient: { label: "Pas assez de données", tone: "neutral" },
};

export const CONFIDENCE_LABELS = { low: "faible", moderate: "moyenne", high: "bonne" } as const;

export type ProgressionVerdict = { headline: string; tone: Tone; reason: string; caution: string | null };

const VERDICT_HEADLINES: Record<Progression["state"], string> = {
  progressing: "Ça progresse",
  stable: "C'est stable",
  regressing: "Ça recule",
  insufficient: "Pas assez de données",
};

/**
 * Verdict de la carte aérobie, en clair : l'état d'abord, puis une seule raison chiffrée en s/km.
 * Le terme technique (« allure à FC égale ») n'apparaît pas : on parle de « ton allure à N bpm ».
 */
export function progressionVerdict(progression: Progression): ProgressionVerdict {
  const { state, windowWeeks } = progression;
  const headline = VERDICT_HEADLINES[state];
  if (state === "insufficient") {
    const missing = Math.max(0, 3 - Math.min(progression.recent.runs, progression.previous.runs));
    return { headline, tone: "neutral", reason: `Il faut 3 sorties faciles par période de ${windowWeeks} semaines pour comparer ; il en manque ${missing}.`, caution: null };
  }
  const gain = progression.paceGainSPerKm ?? 0;
  const amount = formatNumber(Math.abs(gain));
  const caution = progression.confidence === "low" || progression.caveats.length ? "À confirmer : peu de sorties comparées." : null;
  if (state === "stable") {
    const spread = progression.runToRunSpreadSPerKm;
    const reason = Math.abs(gain) < 1
      ? `Même allure qu'il y a ${windowWeeks} semaines.`
      : spread != null && Math.abs(gain) > spread
        ? `${amount} s/km d'écart avec les ${windowWeeks} semaines d'avant, trop peu pour parler d'un changement.`
        : `${amount} s/km d'écart avec les ${windowWeeks} semaines d'avant, ${spread != null && Math.abs(gain) <= spread / 2 ? "bien moins" : "moins"} que ta variation habituelle d'une sortie à l'autre.`;
    return { headline, tone: "neutral", reason, caution: null };
  }
  const faster = gain > 0;
  return {
    headline,
    tone: faster ? "good" : "warning",
    reason: `${amount} s/km plus ${faster ? "vite" : "lent"} qu'il y a ${windowWeeks} semaines, à cœur égal.`,
    caution,
  };
}

/** Le levier de l'objectif, en action courte (sans les chiffres de planification détaillés). */
function leverAction(gap: GoalGap | null): string | null {
  switch (gap?.main) {
    case "frequency": return `ajoute un footing facile en Z2 pour passer à ${gap.nextRunsPerWeek} sorties par semaine`;
    case "volume": return gap.availabilityNote ? "allonge tes sorties plutôt que d'en ajouter, 10 % de volume par semaine au plus" : "monte le volume peu à peu, 10 % par semaine au plus";
    case "long_run": return "allonge ta sortie longue de 2 km toutes les 2 semaines, en Z2";
    case "threshold": return "garde une séance au seuil par semaine";
    default: return null;
  }
}

/**
 * Une seule phrase d'action sous le verdict de la carte aérobie, reliée au levier
 * principal de l'objectif (fréquence, volume, sortie longue, seuil). Pas de marge chiffrée.
 * Plusieurs objectifs au même levier : « tes objectifs » plutôt qu'une course au hasard.
 */
export function progressionAction(progression: Progression, gaps: GoalGap[]): string {
  const withLever = gaps.filter((entry) => entry.main != null);
  const gap = withLever[0] ?? gaps[0] ?? null;
  const lever = leverAction(gap);
  const sameLever = withLever.length > 1 && withLever.every((entry) => entry.main === gap?.main);
  const race = gap ? (sameLever ? "tes objectifs" : `ton ${gap.race}`) : null;
  switch (progression.state) {
    case "insufficient": {
      const missing = Math.max(1, 3 - Math.min(progression.recent.runs, progression.previous.runs));
      return `Ajoute des footings faciles d'au moins 30 min : il en faut ${missing} de plus pour dégager une tendance.`;
    }
    case "progressing":
      return lever ? `Continue sur cette lancée ; pour ${race}, le prochain pas : ${lever}.` : "Continue sur cette lancée : garde la même régularité.";
    case "stable":
      return lever ? `Pour la faire progresser${race ? ` vers ${race}` : ""} : ${lever}.` : "Pour la faire progresser : ajoute un footing facile par semaine.";
    case "regressing":
      return lever ? `Pour la relancer : ${lever}, en gardant les footings vraiment faciles.` : "Pour la relancer : garde des footings réguliers et vraiment faciles.";
  }
}

const REFERENCE_SOURCES: Record<ReferenceHrSource, string> = {
  watch_z2: "le milieu de ta zone 2, selon ta montre",
  threshold: "environ 80 % de ta FC seuil",
  easy_runs: "ta FC habituelle en footing",
  zones_z2: "le milieu de ta zone 2",
};

/** Explication dépliable : d'où vient la FC de référence, comment on compare, et l'écart mesuré. */
export function progressionExplanation(progression: Progression): string {
  const { referenceHeartRateBpm: hr, windowWeeks } = progression;
  const verdict = progressionVerdict(progression);
  const how = `Sur tes sorties faciles, on mesure l'allure que tu tiens par battement de cœur, ramenée à ${hr} bpm (${REFERENCE_SOURCES[progression.referenceSource]}), puis on compare tes ${windowWeeks} dernières semaines aux ${windowWeeks} précédentes.`;
  return [how, verdict.reason, verdict.caution].filter(Boolean).join(" ");
}

export function progressionSentence(progression: Progression): string {
  if (progression.state === "insufficient") return progression.caveats[0] ?? "Pas assez de sorties faciles comparables pour dégager une tendance.";
  const gain = progression.paceGainSPerKm ?? 0;
  const pace = `${formatPace(progression.previous.speedAtReferenceHr)} → ${formatPace(progression.recent.speedAtReferenceHr)} à ${progression.referenceHeartRateBpm} bpm`;
  if (progression.state === "stable") {
    return gain === 0 ? `Allure à FC égale inchangée sur ${progression.windowWeeks} semaines (${pace}).` : `Écart de ${formatNumber(Math.abs(gain))} s/km sur ${progression.windowWeeks} semaines (${pace}), dans la marge de variation d'une sortie à l'autre.`;
  }
  return `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"} à FC égale qu'il y a ${progression.windowWeeks} semaines (${pace}).`;
}

/** Signal qui confirme une hausse de charge, dit simplement ; la « charge inhabituelle » est déjà dans la phrase. */
function plainLoadReason(reason: string): string | null {
  if (reason.startsWith("VFC")) return "une VFC basse";
  if (reason.startsWith("FC de repos")) return "une FC de repos haute";
  if (reason.startsWith("nuit")) return "des nuits courtes";
  if (reason.startsWith("effort perçu")) return "une sortie ressentie dure";
  return null;
}

export function loadMeaning(load: LoadSummary, alert?: LoadAlert | null): { text: string; tone: Tone } {
  if (load.ratio == null) return { text: "Pas encore assez d'historique pour situer ta charge.", tone: "neutral" };
  if (load.ratio < 0.8) return { text: "Semaine plus légère que ta moyenne.", tone: "neutral" };
  if (load.ratio <= 1.3) return { text: "Dans ta norme des 4 dernières semaines.", tone: "good" };
  // Hausse non corroborée (récupération, ressenti, charge absolue) : simple repère, pas de consigne.
  if (alert && alert.reasons.length === 0) return { text: "Au-dessus de tes 4 dernières semaines, sans autre signal : simple repère.", tone: "neutral" };
  // En langage de coureur : les chiffres sont déjà au-dessus (valeur, moyenne, ratio).
  const plain = (alert?.reasons ?? []).map(plainLoadReason).filter((entry): entry is string => entry != null);
  const why = plain.length ? `, avec ${plain.join(", ")}` : "";
  if (load.ratio <= 1.5) return { text: `Semaine plus chargée que d'habitude${why} : garde la prochaine séance facile.`, tone: "warning" };
  return { text: `Semaine bien plus chargée que d'habitude${why} : récupère avant de rajouter de l'intensité.`, tone: "critical" };
}

export function hrvMeaning(recovery: RecoverySignals): { text: string; tone: Tone } {
  const { hrv } = recovery;
  if (hrv.latest == null) return { text: "Pas de mesure de VFC récente.", tone: "neutral" };
  if (recovery.flags.includes("hrv_low")) return { text: "Sous ta plage habituelle : signal à surveiller avant une séance dure.", tone: "warning" };
  if (hrv.baselineHigh != null && hrv.latest > hrv.baselineHigh) return { text: "Au-dessus de ta plage habituelle.", tone: "neutral" };
  return { text: "Dans ta plage habituelle.", tone: "good" };
}

export function sleepMeaning(recovery: RecoverySignals): { text: string; tone: Tone } {
  const { sleep } = recovery;
  if (sleep.latest == null) return { text: "Pas de nuit enregistrée.", tone: "neutral" };
  if (recovery.flags.includes("sleep_short")) return { text: "Nuit courte par rapport à ton habitude.", tone: "warning" };
  return { text: "Durée normale pour toi.", tone: "good" };
}

export function restingHrMeaning(recovery: RecoverySignals): { text: string; tone: Tone } {
  const { restingHr } = recovery;
  if (restingHr.latest == null) return { text: "Pas de mesure récente.", tone: "neutral" };
  if (recovery.flags.includes("resting_hr_high")) return { text: "Au-dessus de ta base : signal à surveiller.", tone: "warning" };
  return { text: "Au niveau de ta base.", tone: "good" };
}

export function sleepCompare(recovery: RecoverySignals): string {
  const { sleep } = recovery;
  const parts: string[] = [];
  if (sleep.delta != null && sleep.baseline != null) parts.push(`${sleep.delta >= 0 ? "+" : "−"}${formatDuration(Math.abs(sleep.delta))} vs ta moyenne (${formatDuration(sleep.baseline)})`);
  if (sleep.score != null) parts.push(`score ${sleep.score}`);
  return parts.join(" · ") || "—";
}

export function restingHrCompare(recovery: RecoverySignals): string {
  const { restingHr } = recovery;
  return restingHr.delta != null && restingHr.baseline != null ? `${formatSigned(restingHr.delta)} bpm vs ta base (${Math.round(restingHr.baseline)} bpm)` : "—";
}

export function hrvCompare(recovery: RecoverySignals): string {
  const { hrv } = recovery;
  return hrv.baselineLow != null && hrv.baselineHigh != null ? `Plage habituelle ${Math.round(hrv.baselineLow)}–${Math.round(hrv.baselineHigh)} ms` : hrv.baseline != null ? `Moyenne 28 j : ${hrv.baseline} ms` : "—";
}
