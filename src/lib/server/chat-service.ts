import "server-only";

import { getLlmClient } from "@/lib/coach";
import { buildChatPrompt, CHAT_HISTORY_MESSAGES, CHAT_SYSTEM_PROMPT, chatAnswerJsonSchema, chatAnswerSchema } from "@/lib/coach/chat-coach";
import { LLM_FAILURE_MESSAGES, LlmError, type LlmFailureKind } from "@/lib/coach/llm";
import { allowedNumbers, collectText, excerpt, findUnsupportedMultiples, findUnsupportedNumbers, findZoneContradictions } from "@/lib/coach/number-guard";
import { createChatRepository, type ChatMessage } from "@/lib/db/repositories/chat-repository";
import { PROGRESSION_LABELS } from "@/lib/engine/explain";
import { VERDICT_LABELS } from "@/lib/engine/verdict";
import { ZONE_LABELS, zoneOf, zoneRange } from "@/lib/engine/zones";
import { formatClock, formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import { goalForCoach } from "@/lib/goal/goal";
import { analyzeSession, getDashboard, recentRunSummaries } from "./analytics";
import { readSessionCoach } from "./coach-service";
import { sessionTitle } from "@/lib/engine/activity-metrics";
import { requireActiveMember } from "@/lib/profiles/context";
import { askerLabel, systemPromptFor } from "@/lib/coach/athlete";
import { checkQuota } from "./quota";
import { recordFailure, recordUsage } from "./usage";

/** Contexte synthétique déjà calculé : jamais de séries brutes, jamais d'historique complet. */
export function buildChatContext(dashboard = getDashboard()) {
  const { suggestion, progression, load, recovery, profile, today } = dashboard;
  const runs = recentRunSummaries(5);
  return {
    aujourd_hui: formatDate(today, "long"),
    objectif: goalForCoach(dashboard.goal, today),
    prochaine_seance: {
      titre: suggestion.primary.title,
      quand: suggestion.when.label,
      duree: suggestion.primary.durationMin ? formatDuration(suggestion.primary.durationMin * 60) : "—",
      cible_fc: suggestion.primary.target ? `${suggestion.primary.target.heartRateLow}–${suggestion.primary.target.heartRateHigh} bpm` : "—",
      raison: suggestion.reason,
      ensuite: suggestion.then ? `${suggestion.then.title}, ${suggestion.then.when.label.toLowerCase()}` : "—",
    },
    progression: {
      etat: PROGRESSION_LABELS[progression.state].label,
      allure_a_fc_reference: `${formatPace(progression.recent.speedAtReferenceHr)} à ${progression.referenceHeartRateBpm} bpm (avant : ${formatPace(progression.previous.speedAtReferenceHr)})`,
      variation_normale: progression.runToRunSpreadSPerKm != null ? `${progression.runToRunSpreadSPerKm} s/km` : "—",
      vo2max_montre: progression.vo2max.latest != null ? formatNumber(progression.vo2max.latest, 1) : "—",
    },
    charge: {
      garmin_7_jours: `${load.acute7d} contre ${load.chronicWeekly28d} par semaine en moyenne`,
      courses_par_semaine_8_sem: formatNumber(load.runsPerWeek8w, 1),
      km_par_semaine_8_sem: formatNumber(load.runKmPerWeek8w, 1),
      intensite_4_sem: load.intensity28d ? `${Math.round(load.intensity28d.low * 100)} % facile, ${Math.round(load.intensity28d.moderate * 100)} % modéré, ${Math.round(load.intensity28d.high * 100)} % intense` : "—",
      volume_6_semaines_km: load.weeks.slice(-6).map((week) => formatNumber(week.runKm, 0)).join(" / "),
    },
    recuperation_du_jour: {
      vfc: recovery.hrv.latest != null ? `${Math.round(recovery.hrv.latest)} ms (plage ${recovery.hrv.baselineLow ?? "—"}–${recovery.hrv.baselineHigh ?? "—"})` : "—",
      fc_repos: recovery.restingHr.latest != null ? `${Math.round(recovery.restingHr.latest)} bpm (base ${recovery.restingHr.baseline ?? "—"})` : "—",
      sommeil: recovery.sleep.latest != null ? formatDuration(recovery.sleep.latest) : "—",
    },
    zones_fc: Object.fromEntries(([1, 2, 3, 4, 5] as const).map((zone) => [ZONE_LABELS[zone], `${zoneRange(zone, profile.zones)[0]}–${zoneRange(zone, profile.zones)[1]} bpm`])),
    dernieres_seances: runs.map((run, index) => ({
      date: formatDate(run.localDate, "medium"),
      type: run.title,
      distance: formatDistance(run.distanceM, 1),
      duree: formatClock(run.movingTimeS),
      allure: formatPace(run.averageSpeedMps),
      fc: run.averageHeartRateBpm ? `${Math.round(run.averageHeartRateBpm)} bpm` : "—",
      // Détail du verdict pour la dernière séance seulement : les plus anciennes n'ont que leur niveau (tokens).
      verdict: `${VERDICT_LABELS[run.verdict as keyof typeof VERDICT_LABELS] ?? run.verdict}${index === 0 && run.headline ? ` : ${run.headline}` : ""}`,
      ...(run.feeling ? { ressenti: `${run.feeling.perceivedEffort != null ? `effort ${run.feeling.perceivedEffort}/10. ` : ""}${run.feeling.note}` } : {}),
    })),
    zoneOf: (heartRate: number) => zoneOf(heartRate, profile.zones),
  };
}

/**
 * Séance choisie par l'athlète pour sa question : son résumé compact (jamais de séries ni de GPS),
 * le verdict, les consignes du moteur, le ressenti et ce que le coach en a déjà dit. Environ 250 tokens.
 */
export function chosenSessionContext(activityId: string): Record<string, unknown> | null {
  const analysis = analyzeSession(activityId);
  if (!analysis) return null;
  const { activity, metrics, verdict, prescription, feeling, deltas } = analysis;
  const coach = readSessionCoach(analysis);
  const said = coach.status === "ready" ? coach.output : coach.status === "missing" ? coach.previous?.output ?? null : null;
  return {
    date: formatDate(activity.localDate, "long"),
    type: sessionTitle(metrics),
    distance: formatDistance(activity.distanceM, 2),
    duree: formatClock(activity.movingTimeS),
    allure_moyenne: formatPace(activity.averageSpeedMps),
    fc_moyenne: activity.averageHeartRateBpm ? `${Math.round(activity.averageHeartRateBpm)} bpm` : "—",
    ...(metrics.work ? { travail: `${metrics.work.reps} répétitions à ${formatPace(metrics.work.averageSpeedMps)}, ${metrics.work.averageHeartRateBpm ? `${Math.round(metrics.work.averageHeartRateBpm)} bpm` : "FC —"}` } : {}),
    verdict: `${VERDICT_LABELS[verdict.level]} : ${verdict.headline}`,
    seances_comparables: deltas.count,
    ...(prescription.status === "ok" ? { consignes: { a_reproduire: prescription.keep, aurait_du: prescription.shouldHave.join(" ") || "rien à corriger", prochaine_fois: prescription.next.cue } } : {}),
    ...(said ? { analyse_du_coach: { verdict: said.verdict, aurait_du: said.shouldHave, prochaine_fois: said.nextTime } } : {}),
    ressenti: feeling ? `${feeling.perceivedEffort != null ? `effort ${feeling.perceivedEffort}/10. ` : ""}${feeling.note}` : "non renseigné",
  };
}

export type AskResult = { messages: ChatMessage[]; error: { kind: LlmFailureKind; message: string } | null };

/** Une question à la fois par profil. */
const busyMembers = new Set<string>();

export async function askCoach(question: string, activityId: string | null = null): Promise<AskResult> {
  const repository = createChatRepository();
  const memberId = requireActiveMember().id;
  if (busyMembers.has(memberId)) return { messages: repository.list(), error: { kind: "unavailable", message: "Le coach répond déjà à une question." } };
  const quota = checkQuota();
  if (!quota.allowed) return { messages: repository.list(), error: { kind: "quota", message: quota.message } };
  busyMembers.add(memberId);
  try {
    const history = repository.list(CHAT_HISTORY_MESSAGES).filter((message) => !message.content.error).map((message) => ({ role: message.role, text: message.content.text }));
    const chosen = activityId ? chosenSessionContext(activityId) : null;
    repository.add("user", { text: question, ...(chosen ? { activity: { id: activityId as string, label: `${chosen.type} · ${chosen.date}` } } : {}) });
    const dashboard = getDashboard();
    const athlete = { isAdmin: requireActiveMember().role === "admin", runsPerWeek12w: dashboard.rhythm.runsPerWeek12w };
    const system = systemPromptFor(CHAT_SYSTEM_PROMPT, athlete);
    const { zoneOf: zoneOfHr, ...base } = buildChatContext(dashboard);
    // Séance choisie : son résumé passe en tête ; la question porte sur elle.
    const context = chosen ? { seance_choisie: chosen, ...base } : base;
    const allowed = allowedNumbers({ context, question, history });
    const basePrompt = buildChatPrompt(context, history, question, askerLabel(athlete));
    let prompt = basePrompt;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let response;
      try {
        response = await getLlmClient().generateStructured({ system, prompt, schema: chatAnswerSchema, jsonSchema: chatAnswerJsonSchema as unknown as Record<string, unknown> });
      } catch (error) {
        recordFailure("chat", null, getLlmClient().name, error);
        throw error;
      }
      const text = collectText(response.data);
      const issues = [...findUnsupportedNumbers(text, allowed), ...findZoneContradictions(text, zoneOfHr), ...findUnsupportedMultiples(text, { context, question, history })];
      recordUsage("chat", null, response.model, issues.length ? "rejected" : "ok", response.usage);
      if (!issues.length) {
        // Certains modèles écrivent « \n » en toutes lettres dans le JSON : on rétablit les sauts de ligne.
        repository.add("coach", { text: response.data.answer.replace(/\\n/g, "\n"), evidence: response.data.evidence }, response.model);
        return { messages: repository.list(), error: null };
      }
      console.warn(`[coach] chat : chiffres ou zones non sourcés (essai ${attempt}) : ${issues.map((token) => excerpt(text, token.split(" ")[0])).join(" | ")}`);
      prompt = `${basePrompt}\n\nATTENTION : ta réponse précédente contenait des erreurs (${issues.join(" ; ")}). Réponds en n'utilisant que des chiffres et des zones présents tels quels dans le contexte.`;
    }
    throw new LlmError("invalid_output", "Chiffres non sourcés");
  } catch (error) {
    const kind: LlmFailureKind = error instanceof LlmError ? error.kind : "unavailable";
    console.warn(`[coach] chat en échec (${kind}) : ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
    repository.add("coach", { text: LLM_FAILURE_MESSAGES[kind].replace("l'analyse chiffrée reste affichée", "la question pourra être reposée un peu plus tard"), error: true });
    return { messages: repository.list(), error: { kind, message: LLM_FAILURE_MESSAGES[kind] } };
  } finally {
    busyMembers.delete(memberId);
  }
}
