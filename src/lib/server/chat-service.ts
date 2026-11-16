import "server-only";

import { getLlmClient } from "@/lib/coach";
import { buildChatPrompt, CHAT_HISTORY_MESSAGES, CHAT_SYSTEM_PROMPT, chatAnswerJsonSchema, chatAnswerSchema } from "@/lib/coach/chat-coach";
import { LLM_FAILURE_MESSAGES, LlmError, type LlmFailureKind } from "@/lib/coach/llm";
import { allowedNumbers, collectText, findUnsupportedNumbers, findZoneContradictions } from "@/lib/coach/number-guard";
import { createChatRepository, type ChatMessage } from "@/lib/db/repositories/chat-repository";
import { PROGRESSION_LABELS } from "@/lib/engine/explain";
import { VERDICT_LABELS } from "@/lib/engine/verdict";
import { ZONE_LABELS, zoneOf, zoneRange } from "@/lib/engine/zones";
import { formatClock, formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import { goalForCoach } from "@/lib/goal/goal";
import { getDashboard, recentRunSummaries } from "./analytics";
import { recordFailure, recordUsage } from "./usage";

/** Contexte synthétique déjà calculé : jamais de séries brutes, jamais d'historique complet. */
export function buildChatContext() {
  const dashboard = getDashboard();
  const { suggestion, progression, load, recovery, profile, today } = dashboard;
  const runs = recentRunSummaries(6);
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
      volume_8_semaines_km: load.weeks.slice(-8).map((week) => formatNumber(week.runKm, 1)).join(" / "),
    },
    recuperation_du_jour: {
      vfc: recovery.hrv.latest != null ? `${Math.round(recovery.hrv.latest)} ms (plage ${recovery.hrv.baselineLow ?? "—"}–${recovery.hrv.baselineHigh ?? "—"})` : "—",
      fc_repos: recovery.restingHr.latest != null ? `${Math.round(recovery.restingHr.latest)} bpm (base ${recovery.restingHr.baseline ?? "—"})` : "—",
      sommeil: recovery.sleep.latest != null ? formatDuration(recovery.sleep.latest) : "—",
    },
    zones_fc: Object.fromEntries(([1, 2, 3, 4, 5] as const).map((zone) => [ZONE_LABELS[zone], `${zoneRange(zone, profile.zones)[0]}–${zoneRange(zone, profile.zones)[1]} bpm`])),
    dernieres_seances: runs.map((run) => ({
      date: formatDate(run.localDate, "medium"),
      type: run.title,
      distance: formatDistance(run.distanceM, 1),
      duree: formatClock(run.movingTimeS),
      allure: formatPace(run.averageSpeedMps),
      fc: run.averageHeartRateBpm ? `${Math.round(run.averageHeartRateBpm)} bpm` : "—",
      verdict: `${VERDICT_LABELS[run.verdict as keyof typeof VERDICT_LABELS] ?? run.verdict} : ${run.headline}`,
      ressenti: run.feeling ? `${run.feeling.perceivedEffort != null ? `effort ${run.feeling.perceivedEffort}/10. ` : ""}${run.feeling.note}` : "—",
    })),
    zoneOf: (heartRate: number) => zoneOf(heartRate, profile.zones),
  };
}

export type AskResult = { messages: ChatMessage[]; error: { kind: LlmFailureKind; message: string } | null };

const inFlight = { busy: false };

export async function askCoach(question: string): Promise<AskResult> {
  const repository = createChatRepository();
  if (inFlight.busy) return { messages: repository.list(), error: { kind: "unavailable", message: "Le coach répond déjà à une question." } };
  inFlight.busy = true;
  try {
    const history = repository.list(CHAT_HISTORY_MESSAGES).filter((message) => !message.content.error).map((message) => ({ role: message.role, text: message.content.text }));
    repository.add("user", { text: question });
    const { zoneOf: zoneOfHr, ...context } = buildChatContext();
    const allowed = allowedNumbers({ context, question, history });
    const basePrompt = buildChatPrompt(context, history, question);
    let prompt = basePrompt;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let response;
      try {
        response = await getLlmClient().generateStructured({ system: CHAT_SYSTEM_PROMPT, prompt, schema: chatAnswerSchema, jsonSchema: chatAnswerJsonSchema as unknown as Record<string, unknown> });
      } catch (error) {
        recordFailure("chat", null, getLlmClient().name, error);
        throw error;
      }
      const text = collectText(response.data);
      const issues = [...findUnsupportedNumbers(text, allowed), ...findZoneContradictions(text, zoneOfHr)];
      recordUsage("chat", null, response.model, issues.length ? "rejected" : "ok", response.usage);
      if (!issues.length) {
        // Certains modèles écrivent « \n » en toutes lettres dans le JSON : on rétablit les sauts de ligne.
        repository.add("coach", { text: response.data.answer.replace(/\\n/g, "\n"), evidence: response.data.evidence }, response.model);
        return { messages: repository.list(), error: null };
      }
      console.warn(`[coach] chat : chiffres ou zones non sourcés (essai ${attempt}) : ${issues.join(", ")}`);
      prompt = `${basePrompt}\n\nATTENTION : ta réponse précédente contenait des erreurs (${issues.join(" ; ")}). Réponds en n'utilisant que des chiffres et des zones présents tels quels dans le contexte.`;
    }
    throw new LlmError("invalid_output", "Chiffres non sourcés");
  } catch (error) {
    const kind: LlmFailureKind = error instanceof LlmError ? error.kind : "unavailable";
    console.warn(`[coach] chat en échec (${kind}) : ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
    repository.add("coach", { text: LLM_FAILURE_MESSAGES[kind].replace("l'analyse chiffrée reste affichée", "pose ta question à nouveau un peu plus tard"), error: true });
    return { messages: repository.list(), error: { kind, message: LLM_FAILURE_MESSAGES[kind] } };
  } finally {
    inFlight.busy = false;
  }
}
