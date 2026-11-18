import "server-only";

import { addDays, localDate, startOfIsoWeek } from "@/lib/dates";
import { normalizeSessionOutput } from "@/lib/coach/session-coach";
import { createChatRepository } from "@/lib/db/repositories/chat-repository";
import { createCoachOutputRepository } from "@/lib/db/repositories/coach-output-repository";
import { createUsageRepository } from "@/lib/db/repositories/usage-repository";
import { paceSeconds, sessionTitle, type SessionFamily } from "@/lib/engine/activity-metrics";
import { compareToAdvice, type AdviceTarget } from "@/lib/engine/adherence";
import { goalStatus, type Prescription } from "@/lib/engine/prescription";
import type { SessionTarget, SuggestionType } from "@/lib/engine/suggestion";
import { VERDICT_LABELS } from "@/lib/engine/verdict";
import { formatDate, formatDuration, formatPace } from "@/lib/formatters";
import { analyzeSession, getDashboard, loadContext, suggestionBefore } from "./analytics";

/**
 * Dossier compact d'une semaine (lundi → dimanche) pour le bilan hebdomadaire :
 * ce qui a été conseillé, ce qui a été couru, le respect des conseils, le
 * ressenti. Uniquement des synthèses formatées : ni flux, ni GPS.
 */

const FAMILIES_FOR: Record<SuggestionType, SessionFamily[]> = {
  endurance: ["easy"],
  recovery_run: ["easy"],
  long: ["long", "easy"],
  threshold: ["intervals", "steady"],
  vo2max: ["intervals"],
  specific: ["intervals", "steady"],
  taper: ["easy", "intervals"],
  race: ["steady", "intervals"],
  rest: [],
};

function fromSuggestionTarget(target: SessionTarget | null): AdviceTarget | null {
  if (!target) return null;
  return { paceFastS: target.paceFastMps ? paceSeconds(target.paceFastMps) : null, paceSlowS: target.paceSlowMps ? paceSeconds(target.paceSlowMps) : null, heartRateLow: target.heartRateLow, heartRateHigh: target.heartRateHigh };
}

function targetText(target: AdviceTarget | null): string {
  if (!target) return "—";
  const pace = target.paceFastS != null && target.paceSlowS != null ? `${formatPace(1000 / target.paceFastS).replace("/km", "")}–${formatPace(1000 / target.paceSlowS)}` : null;
  const hr = target.heartRateLow != null && target.heartRateHigh != null ? `${target.heartRateLow}–${target.heartRateHigh} bpm` : null;
  return [pace, hr].filter(Boolean).join(", ") || "—";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function engineDirectives(prescription: Prescription) {
  if (prescription.status === "none") return { note: `pas de consigne (${prescription.reason})` };
  return { aurait_du: prescription.shouldHave.length ? prescription.shouldHave : ["rien à corriger"], a_reproduire: prescription.keep ?? "—", prochaine_fois: prescription.next.cue };
}

export type WeeklyDossier = ReturnType<typeof buildWeeklyDossier>;

/** Semaine complète la plus récente (lundi), ou la semaine en cours le dimanche soir. */
export function defaultReviewWeek(today: string): string {
  const monday = startOfIsoWeek(today);
  const sunday = addDays(monday, 6);
  return today === sunday ? monday : addDays(monday, -7);
}

export function buildWeeklyDossier(weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  const context = loadContext();
  const outputs = createCoachOutputRepository();
  const weekRuns = context.runs.filter((run) => run.localDate >= weekStart && run.localDate <= weekEnd);
  const missing: string[] = [];

  const sessions = weekRuns.map((run) => {
    const analysis = analyzeSession(run.id, context);
    const before = suggestionBefore(run.id, context);
    // Consigne « prochaine fois » de la précédente séance du même type : a-t-elle été appliquée ?
    const previousSame = [...context.runs].reverse().find((entry) => entry.startTimeUtc < run.startTimeUtc && entry.metrics.kind === run.metrics.kind && entry.localDate >= addDays(run.localDate, -60));
    const previousPrescription = previousSame ? analyzeSession(previousSame.id, context)?.prescription ?? null : null;
    const latest = outputs.latest("session", run.id);
    const coach = latest ? normalizeSessionOutput(JSON.parse(latest.outputJson)) : null;
    const suggestionTarget = before ? fromSuggestionTarget(before.suggestion.primary.target) : null;
    if (!analysis?.feeling) missing.push(`ressenti non renseigné (${formatDate(run.localDate, "short")})`);
    return {
      date: formatDate(run.localDate, "medium"),
      type: sessionTitle(run.metrics),
      duree: formatDuration(run.movingTimeS),
      verdict: analysis ? VERDICT_LABELS[analysis.verdict.level] : "—",
      ecart_principal: analysis?.verdict.signals.find((signal) => signal.primary)?.label ?? "—",
      conseil_affiche_avant: before
        ? {
            seance: before.suggestion.primary.title,
            prevue: before.suggestion.when.label,
            cible: targetText(suggestionTarget),
            raison: before.suggestion.reason,
            respect: (() => {
              const adherence = compareToAdvice(run.metrics, FAMILIES_FOR[before.suggestion.primary.type], suggestionTarget);
              return { meme_type: adherence.typeMatch ? "oui" : "non", allure: adherence.pace, fc: adherence.heartRate, suivi: adherence.followed ? "oui" : "non" };
            })(),
          }
        : null,
      consigne_de_la_fois_precedente: previousSame && previousPrescription?.status === "ok"
        ? (() => {
            const target = previousPrescription.next.target;
            const adherence = compareToAdvice(run.metrics, [run.metrics.family], { paceFastS: target.paceFastS, paceSlowS: target.paceSlowS, heartRateLow: target.heartRateLow, heartRateHigh: target.heartRateHigh });
            return { recalculee_par_le_moteur_apres: `${sessionTitle(previousSame.metrics)}, ${formatDate(previousSame.localDate, "medium")}`, consigne: previousPrescription.next.cue, allure: adherence.pace, fc: adherence.heartRate, suivie: adherence.followed ? "oui" : "non" };
          })()
        : null,
      consignes_moteur: analysis ? engineDirectives(analysis.prescription) : null,
      analyse_du_coach: coach
        ? { version: latest?.promptVersion ?? "—", verdict: coach.verdict, constats: coach.bullets, a_reproduire: coach.keep, aurait_du: coach.shouldHave, prochaine_fois: coach.nextTime || "—" }
        : "non générée",
      ressenti: analysis?.feeling ? { effort_percu: analysis.feeling.perceivedEffort != null ? `${analysis.feeling.perceivedEffort}/10` : "—", note: clip(analysis.feeling.note || "—", 200) } : "non renseigné",
    };
  });

  const from = new Date(`${weekStart}T00:00:00`).toISOString();
  const to = new Date(`${addDays(weekEnd, 1)}T00:00:00`).toISOString();
  const outlooks = outputs.createdBetween("outlook", from, to).slice(0, 7).map((row) => {
    const output = JSON.parse(row.outputJson) as { suggestionWhy?: string; executionTip?: string };
    return { le: formatDate(localDate(new Date(row.createdAt)), "medium"), pourquoi: output.suggestionWhy ?? "—", execution: output.executionTip ?? "—" };
  });
  const chat = createChatRepository().all().filter((message) => message.createdAt >= from && message.createdAt < to);
  const exchanges: Array<{ question: string; reponse: string }> = [];
  for (let index = 0; index < chat.length && exchanges.length < 5; index += 1) {
    const message = chat[index];
    const next = chat[index + 1];
    if (message.role === "user" && next?.role === "coach") exchanges.push({ question: clip(message.content.text, 200), reponse: clip(next.content.text, 320) });
  }
  const usage = createUsageRepository().since(from).filter((row) => row.createdAt < to && (row.kind === "session" || row.kind === "outlook" || row.kind === "chat"));
  const rejected = usage.filter((row) => row.outcome === "rejected").length;

  const dashboard = getDashboard();
  // Habitudes réelles des 8 semaines jusqu'à la fin de la semaine : le bilan ne peut pas en affirmer d'autres.
  const habitStart = addDays(weekEnd, -55);
  const habitRuns = context.runs.filter((run) => run.localDate >= habitStart && run.localDate <= weekEnd);
  const byType = new Map<string, number>();
  for (const run of habitRuns) {
    const label = run.metrics.family === "easy" || run.metrics.family === "long" ? "sortie facile ou longue" : run.metrics.family === "intervals" ? "fractionné" : "continu tempo ou seuil";
    byType.set(label, (byType.get(label) ?? 0) + 1);
  }
  const weekdays = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const easyDays = new Map<string, number>();
  for (const run of habitRuns.filter((entry) => entry.metrics.family === "easy" || entry.metrics.family === "long")) {
    const day = weekdays[(new Date(`${run.localDate}T12:00:00Z`).getUTCDay() + 6) % 7];
    easyDays.set(day, (easyDays.get(day) ?? 0) + 1);
  }
  if (!weekRuns.length) missing.push("aucune course cette semaine");
  return {
    semaine: `du ${formatDate(weekStart, "medium")} au ${formatDate(weekEnd, "medium")}`,
    objectifs: dashboard.goalMarkers.map((marker) => {
      const status = goalStatus(marker, null, null);
      return `${status.race} en ${status.goal} : ${status.verdict} Repère : ${status.current}.`;
    }),
    habitudes_8_semaines: {
      courses: `${habitRuns.length} en 8 semaines`,
      par_type: [...byType.entries()].map(([label, count]) => `${label} : ${count}`),
      sorties_faciles_par_jour: [...easyDays.entries()].map(([day, count]) => `${day} : ${count}`),
    },
    ecart_objectif: dashboard.goalGaps.length ? dashboard.goalGaps.map((gap) => gap.summary) : "aucun objectif chiffré",
    seances: sessions,
    conseils_du_jour_generes: outlooks.length ? outlooks : "aucun",
    questions_au_coach: exchanges.length ? exchanges : "aucune",
    reponses_refusees_par_le_garde_fou: `${rejected} sur ${usage.length} appels`,
    donnees_manquantes: missing.length ? missing : "aucune",
  };
}
