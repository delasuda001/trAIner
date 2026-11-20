import { z } from "zod";
import type { LoadSummary } from "@/lib/engine/load";
import { paceReferenceSentence, type Prescription } from "@/lib/engine/prescription";
import type { Progression } from "@/lib/engine/progression";
import type { RecoverySignals } from "@/lib/engine/recovery";
import type { Suggestion } from "@/lib/engine/suggestion";
import { formatDate, formatDuration, formatNumber, formatPace, formatSigned } from "@/lib/formatters";

export const OUTLOOK_PROMPT_VERSION = "outlook-v6";

export const outlookCoachSchema = z.object({
  suggestionWhy: z.string().min(10).max(400),
  executionTip: z.string().min(10).max(350),
  progressionSentence: z.string().min(10).max(400),
});

export type OutlookCoachOutput = z.infer<typeof outlookCoachSchema>;

export const outlookCoachJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestionWhy", "executionTip", "progressionSentence"],
  properties: {
    suggestionWhy: { type: "string", description: "Pourquoi cette séance maintenant, en une phrase de 200 caractères au plus, sans répéter les cibles." },
    executionTip: { type: "string", description: "Comment la réussir : une consigne d'exécution chiffrée (départ, 1re répétition, récupération, plafond de FC), une phrase de 180 caractères au plus." },
    progressionSentence: { type: "string", description: "Ce que signifie l'indicateur de progression, une phrase de 200 caractères au plus, qui n'énonce pas l'état ni la confiance (déjà affichés)." },
  },
} as const;

export const OUTLOOK_SYSTEM_PROMPT = `Tu es le coach de course à pied de Bastien, coureur expérimenté qui court 1 à 2 fois par semaine. Un moteur déterministe a déjà choisi sa prochaine séance (et celle d'après) et calculé son indicateur de progression ; tu les expliques.

Règles absolues :
- Français, tutoiement, ton direct et précis, sans remplissage.
- Chaque chiffre que tu écris doit apparaître tel quel dans la charge utile. N'en calcule ni n'en invente aucun.
- La fourchette de FC et d'allure est déjà affichée : ne la recopie pas telle quelle. "executionTip" donne une consigne d'exécution chiffrée et précise (allure de départ, 1re répétition, récupération, moment où relâcher), tirée de "lecon_de_ta_derniere_seance_du_meme_type" quand elle existe, sinon du déroulé. Jamais de conseil générique du type « écoute tes sensations ».
- Ne change pas la séance proposée ni l'état de progression.
- Si "alternative_si_recuperation_degradee" n'est pas nulle, "executionTip" se termine par sa condition et l'alternative (sa durée), en quelques mots.
- Relie la séance à l'objectif quand il est renseigné, par "ecart_objectif" s'il existe : dis ce que la séance apporte au levier principal (un footing ajouté, une sortie longue allongée…). Sans objectif, raisonne sur la progression aérobie.
- "suggestionWhy" en langage de coureur : jamais de charge Garmin brute, de ratio (« 1,6 fois ») ni de « semaine médiane ». Dis plutôt « ta semaine a été plus chargée que d'habitude » ; ces chiffres restent dans le détail.
- Si l'écart de progression est dans la variation normale d'une sortie à l'autre, dis-le en mots simples. Si les données sont insuffisantes, dis ce qui manque.
- Pas de conseil générique. Aucune interprétation médicale, ni score de forme ou de fatigue. Pas de remarque sur la température.

Format : "suggestionWhy" (pourquoi cette séance maintenant), "executionTip" (comment la réussir), "progressionSentence" (ce que la progression veut dire pour lui). Une phrase chacun.`;

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

export type SameTypeLesson = { localDate: string; title: string; prescription: Prescription } | null;

function describeLesson(lesson: SameTypeLesson) {
  if (!lesson || lesson.prescription.status !== "ok") return null;
  return {
    seance: `${lesson.title}, ${formatDate(lesson.localDate, "medium")}`,
    a_corriger: lesson.prescription.shouldHave.length ? lesson.prescription.shouldHave : ["rien : séance dans la cible"],
    consigne: lesson.prescription.next.cue,
    ...(lesson.prescription.goal ? { repere_du_moment: paceReferenceSentence(lesson.prescription.goal) } : {}),
  };
}

export function buildOutlookPayload(input: { suggestion: Suggestion; progression: Progression; recovery: RecoverySignals; load: LoadSummary; goal: Record<string, string>; lastSameType?: SameTypeLesson; goalGaps?: string[] }) {
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
      seance_d_apres: suggestion.then ? `${suggestion.then.title}${suggestion.then.durationMin ? ` (${formatDuration(suggestion.then.durationMin * 60)})` : ""}, ${suggestion.then.when.label.toLowerCase()}` : "—",
    },
    objectif: input.goal,
    ...(input.goalGaps?.length ? { ecart_objectif: input.goalGaps } : {}),
    lecon_de_ta_derniere_seance_du_meme_type: describeLesson(input.lastSameType ?? null),
    contexte: {
      jours_depuis_derniere_course: suggestion.facts.daysSinceLastRun,
      derniere_course: suggestion.facts.lastRunKind,
      jours_depuis_derniere_qualite: suggestion.facts.daysSinceLastQuality,
      jours_depuis_derniere_sortie_longue: suggestion.facts.daysSinceLastLong,
      courses_par_semaine_8_sem: formatNumber(suggestion.facts.runsPerWeek8w, 1),
      charge_garmin_7j_vs_moyenne_4_sem: load.ratio == null ? "—" : `${formatNumber(load.ratio, 1)} fois`,
      sorties_prevues_par_semaine: String(suggestion.facts.plannedRunsPerWeek),
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
      variation_normale_d_une_sortie_a_l_autre: progression.runToRunSpreadSPerKm == null ? "—" : `${progression.runToRunSpreadSPerKm} s/km`,
      vo2max_montre: progression.vo2max.latest != null ? `${formatNumber(progression.vo2max.latest, 1)}${progression.vo2max.weeksAgo != null ? ` (${formatNumber(progression.vo2max.weeksAgo, 1)} il y a ${progression.windowWeeks} semaines)` : ""}` : "—",
      reserves: progression.caveats,
    },
    cible: target ? `${target.zone}` : null,
  };
}

export type OutlookPayload = ReturnType<typeof buildOutlookPayload>;

export function buildOutlookPrompt(payload: OutlookPayload): string {
  return `Explique la prochaine séance et l'indicateur de progression.\n\n${JSON.stringify(payload)}`;
}
