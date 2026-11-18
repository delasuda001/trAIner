import { formatDuration, formatNumber, formatPace, formatSigned } from "@/lib/formatters";
import type { LoadAlert, LoadSummary } from "./load";
import type { Progression } from "./progression";
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
  insufficient: "Pas encore de tendance",
};

/**
 * Verdict de la carte aérobie, en clair : l'état d'abord, puis une seule raison chiffrée en s/km.
 * Le terme technique (« allure à FC égale ») n'apparaît pas : on parle de « ton allure à N bpm ».
 */
export function progressionVerdict(progression: Progression): ProgressionVerdict {
  const { state, windowWeeks, referenceHeartRateBpm: hr } = progression;
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
      ? `Même allure à ${hr} bpm qu'il y a ${windowWeeks} semaines.`
      : `${amount} s/km d'écart à ${hr} bpm en ${windowWeeks} semaines${spread != null && Math.abs(gain) <= spread ? `, moins que ta variation normale d'une sortie à l'autre (±${spread} s/km)` : ", trop peu pour parler d'un changement"}.`;
    return { headline, tone: "neutral", reason, caution: null };
  }
  const faster = gain > 0;
  return {
    headline,
    tone: faster ? "good" : "warning",
    reason: `À ${hr} bpm, tu cours ${amount} s/km plus ${faster ? "vite" : "lentement"} qu'il y a ${windowWeeks} semaines.`,
    caution,
  };
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

export function loadMeaning(load: LoadSummary, alert?: LoadAlert | null): { text: string; tone: Tone } {
  if (load.ratio == null) return { text: "Pas encore assez d'historique pour situer ta charge.", tone: "neutral" };
  if (load.ratio < 0.8) return { text: "Semaine plus légère que ta moyenne.", tone: "neutral" };
  if (load.ratio <= 1.3) return { text: "Dans ta norme des 4 dernières semaines.", tone: "good" };
  // Hausse non corroborée (récupération, ressenti, charge absolue) : simple repère, pas de consigne.
  if (alert && alert.reasons.length === 0) return { text: "Au-dessus de tes 4 dernières semaines, sans autre signal : simple repère.", tone: "neutral" };
  const why = alert?.reasons.length ? ` (${alert.reasons.join(", ")})` : "";
  if (load.ratio <= 1.5) return { text: `Hausse marquée${why} : garde la prochaine séance facile.`, tone: "warning" };
  return { text: `Pic de charge${why} : absorbe avant de rajouter de l'intensité.`, tone: "critical" };
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
