import { z } from "zod";
import type { LoadSummary } from "@/lib/engine/load";
import type { Progression } from "@/lib/engine/progression";
import type { RecoverySignals } from "@/lib/engine/recovery";
import type { Suggestion } from "@/lib/engine/suggestion";
import { formatDate, formatDuration, formatNumber, formatPace, formatSigned } from "@/lib/formatters";

export const OUTLOOK_PROMPT_VERSION = "outlook-v1";

export const outlookCoachSchema = z.object({
  suggestionWhy: z.string().min(10).max(260),
  executionTip: z.string().min(10).max(220),
  progressionSentence: z.string().min(10).max(260),
});

export type OutlookCoachOutput = z.infer<typeof outlookCoachSchema>;

export const outlookCoachJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestionWhy", "executionTip", "progressionSentence"],
  properties: {
    suggestionWhy: { type: "string", description: "Pourquoi cette séance maintenant, en une phrase." },
    executionTip: { type: "string", description: "Un conseil d'exécution concret pour cette séance, en une phrase." },
    progressionSentence: { type: "string", description: "Ce que dit l'indicateur de progression, en une phrase." },
  },
} as const;

export const OUTLOOK_SYSTEM_PROMPT = `Tu es le coach de course à pied de Bastien, coureur expérimenté qui court 1 à 2 fois par semaine. Un moteur déterministe a déjà choisi sa prochaine séance et calculé son indicateur de progression ; tu les expliques.

Règles absolues :
- Français, tutoiement, ton direct et précis, sans remplissage.
- Chaque chiffre que tu écris doit apparaître tel quel dans la charge utile. N'en calcule ni n'en invente aucun.
- Ne change pas la séance proposée ni l'état de progression : tu les expliques.
- Si l'état de progression est « données insuffisantes », dis-le franchement et dis ce qui manque.
- Si la confiance est faible, dis-le.
- Pas de conseil générique. Aucune interprétation médicale, ni score de forme ou de fatigue.

Format : "suggestionWhy" (pourquoi cette séance, maintenant, une phrase), "executionTip" (comment la réussir, une phrase concrète), "progressionSentence" (une phrase).`;

const STATE_LABELS: Record<Progression["state"], string> = {
  progressing: "en progression",
  stable: "stable",
  regressing: "en recul",
  insufficient: "données insuffisantes",
};

const FLAG_LABELS: Record<RecoverySignals["flags"][number], string> = {
  hrv_low: "VFC sous la plage habituelle",
  resting_hr_high: "FC de repos au-dessus de la base",
  sleep_short: "nuit courte",
};

const CONFIDENCE_LABELS = { low: "faible", moderate: "moyenne", high: "bonne" } as const;

export function buildOutlookPayload(input: { suggestion: Suggestion; progression: Progression; recovery: RecoverySignals; load: LoadSummary }) {
  const { suggestion, progression, recovery, load } = input;
  const primary = suggestion.primary;
  const target = primary.target;
  const describeSession = (session: typeof primary) => ({
    titre: session.title,
    duree: formatDuration(session.durationMin * 60),
    deroule: session.structure,
    cible_fc: session.target ? `${session.target.heartRateLow}–${session.target.heartRateHigh} bpm (${session.target.zone})` : "—",
    cible_allure: session.target?.paceFastMps && session.target.paceSlowMps ? `${formatPace(session.target.paceSlowMps)} à ${formatPace(session.target.paceFastMps)}` : "—",
  });
  return {
    prochaine_seance: {
      ...describeSession(primary),
      quand: suggestion.when.label,
      raison_moteur: suggestion.reason,
      alternative_si_recuperation_degradee: suggestion.alternative ? { ...describeSession(suggestion.alternative), condition: suggestion.alternative.reason } : null,
    },
    contexte: {
      jours_depuis_derniere_course: suggestion.facts.daysSinceLastRun,
      derniere_course: suggestion.facts.lastRunKind,
      jours_depuis_derniere_qualite: suggestion.facts.daysSinceLastQuality,
      jours_depuis_derniere_sortie_longue: suggestion.facts.daysSinceLastLong,
      courses_par_semaine_8_sem: formatNumber(suggestion.facts.runsPerWeek8w, 1),
      charge_7j_vs_moyenne_4_sem: load.ratio == null ? "—" : `${formatNumber(load.ratio, 1)} fois`,
      temps_z4_z5_28j: load.intensity28d ? `${Math.round(load.intensity28d.high * 100)} %` : "—",
      recuperation: {
        vfc_nuit: recovery.hrv.latest != null ? `${Math.round(recovery.hrv.latest)} ms (plage habituelle ${recovery.hrv.baselineLow ?? "—"}–${recovery.hrv.baselineHigh ?? "—"} ms)` : "—",
        fc_repos: recovery.restingHr.latest != null ? `${Math.round(recovery.restingHr.latest)} bpm (${recovery.restingHr.delta != null ? `${formatSigned(recovery.restingHr.delta)} vs base` : "base inconnue"})` : "—",
        sommeil: recovery.sleep.latest != null ? formatDuration(recovery.sleep.latest) : "—",
        signaux_degrades: recovery.flags.length ? recovery.flags.map((flag) => FLAG_LABELS[flag]) : "aucun",
      },
    },
    progression: {
      etat: STATE_LABELS[progression.state],
      confiance: progression.confidence ? CONFIDENCE_LABELS[progression.confidence] : "—",
      indicateur: `allure à ${progression.referenceHeartRateBpm} bpm sur les sorties faciles`,
      periode_recente: `${formatDate(progression.recent.start, "short")} – ${formatDate(progression.recent.end, "short")} : ${progression.recent.runs} sorties, ${formatPace(progression.recent.speedAtReferenceHr)}`,
      periode_precedente: `${formatDate(progression.previous.start, "short")} – ${formatDate(progression.previous.end, "short")} : ${progression.previous.runs} sorties, ${formatPace(progression.previous.speedAtReferenceHr)}`,
      ecart: progression.paceGainSPerKm == null ? "—" : progression.paceGainSPerKm === 0 ? "identique" : `${formatNumber(Math.abs(progression.paceGainSPerKm))} s/km plus ${progression.paceGainSPerKm > 0 ? "rapide" : "lent"} à FC égale`,
      volume: `${formatNumber(progression.previous.runKmPerWeek, 1)} puis ${formatNumber(progression.recent.runKmPerWeek, 1)} km/semaine`,
      vo2max_montre: progression.vo2max.latest != null ? `${formatNumber(progression.vo2max.latest, 1)}${progression.vo2max.weeksAgo != null ? ` (${formatNumber(progression.vo2max.weeksAgo, 1)} il y a ${progression.windowWeeks} semaines)` : ""}` : "—",
      reserves: progression.caveats,
    },
    cible: target ? `${target.zone}` : null,
  };
}

export type OutlookPayload = ReturnType<typeof buildOutlookPayload>;

export function buildOutlookPrompt(payload: OutlookPayload): string {
  return `Explique la prochaine séance et l'indicateur de progression.\n\n${JSON.stringify(payload, null, 2)}`;
}
