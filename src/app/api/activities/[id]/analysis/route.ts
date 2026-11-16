import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { createAnalysisRepository, parseStoredAnalysis } from "@/lib/db/repositories/analysis-repository";
import { buildActivityAnalysisContext } from "@/lib/llm/context";
import { GeminiAnalysisClient, DEBRIEF_PROMPT_VERSION } from "@/lib/llm/gemini-client";
import { serializeJson } from "@/lib/db/contracts";
import { activityAnalysisResponseSchema, thresholdEstimateSchema, historicalComparisonSchema } from "@/lib/llm/schemas";
import type { z } from "zod";

type FullThresholdEstimate = z.infer<typeof thresholdEstimateSchema>;
type FullHistoricalComparison = z.infer<typeof historicalComparisonSchema>;

/** Sous-ensemble du bloc seuil exposé au client (provenance + confiance + fraîcheur). */
function toClientThresholdEstimate(estimate: FullThresholdEstimate) {
  return {
    thresholdPaceMinKm: estimate.thresholdPaceMinKm,
    confidenceLevel: estimate.confidenceLevel,
    basis: estimate.basis,
    windowWeeks: estimate.windowWeeks,
    usedDeclaredReferenceFallback: estimate.usedDeclaredReferenceFallback,
    retainedPoints: estimate.retainedPoints,
    missingZones: estimate.missingZones,
    suggestedSessions: estimate.suggestedSessions,
    rejectedPoints: estimate.rejectedPoints,
    biasHint: estimate.biasHint,
    staleWarning: estimate.staleWarning,
  };
}

/**
 * Relit le bloc seuil persisté dans `deterministic_metrics_json`. Les analyses
 * antérieures à l'ajout de la provenance ne le contiennent pas (ou partiellement)
 * -> `null` proprement, l'UI s'adapte.
 */
function extractStoredThresholdEstimate(deterministicMetricsJson: string): ReturnType<typeof toClientThresholdEstimate> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(deterministicMetricsJson);
  } catch {
    return null;
  }
  const threshold = (raw as { threshold?: unknown } | null)?.threshold;
  const parsed = thresholdEstimateSchema.safeParse(threshold);
  return parsed.success ? toClientThresholdEstimate(parsed.data) : null;
}

/** Sous-ensemble de la comparaison historique exposé au client (transparence méthodologique, niveau 3). */
function toClientHistoricalComparison(comparison: FullHistoricalComparison) {
  return {
    comparableActivitiesCount: comparison.comparableActivitiesCount,
    insufficientDataReason: comparison.insufficientDataReason,
    usedDeclaredReferenceFallback: comparison.usedDeclaredReferenceFallback,
    comparabilityBreakdown: comparison.comparabilityBreakdown,
  };
}

/**
 * Relit la comparaison historique persistée dans `historical_comparison_json`.
 * Les analyses antérieures au chantier de comparaison structurée n'ont pas
 * les champs `usedDeclaredReferenceFallback`/`comparabilityBreakdown` ->
 * `null` proprement plutôt qu'une valeur fabriquée.
 */
function extractStoredHistoricalComparison(historicalComparisonJson: string | null): ReturnType<typeof toClientHistoricalComparison> | null {
  if (!historicalComparisonJson) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(historicalComparisonJson);
  } catch {
    return null;
  }
  const parsed = historicalComparisonSchema.safeParse(raw);
  return parsed.success ? toClientHistoricalComparison(parsed.data) : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = randomUUID();

  try {
    if (!id.trim() || id.includes("/")) {
      return NextResponse.json({ error: { code: "INVALID_ACTIVITY_ID", message: "Invalid activity ID", requestId } }, { status: 400 });
    }

    const database = getDb();
    const analysisRepo = createAnalysisRepository(database);
    const latest = await analysisRepo.findLatestByActivityId(id);

    if (!latest) {
      return NextResponse.json({ error: { code: "NO_ANALYSIS", message: "No analysis found for this activity", requestId } }, { status: 404 });
    }

    const parsed = parseStoredAnalysis(latest);
    if (parsed.status === "outdated") {
      console.warn("[analysis] stored payload does not match current schema", { requestId, analysisId: latest.id, issues: parsed.issues });
    }

    return NextResponse.json({
      id: latest.id,
      activityId: id,
      analysis: parsed.status === "ok" ? parsed.analysis : null,
      // Forme : bloquant si un champ requis manque (Zod).
      formatOutdated: parsed.status === "outdated",
      // Logique : non bloquant, contenu affichable, mais généré avec un prompt antérieur.
      logicStale: latest.promptVersion !== DEBRIEF_PROMPT_VERSION,
      thresholdEstimate: extractStoredThresholdEstimate(latest.deterministicMetricsJson),
      historicalComparison: extractStoredHistoricalComparison(latest.historicalComparisonJson),
      model: latest.llmModel,
      promptVersion: latest.promptVersion,
      currentPromptVersion: DEBRIEF_PROMPT_VERSION,
      createdAt: latest.createdAt,
    });
  } catch (error) {
    console.error("[analysis] GET error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "An error occurred", requestId } }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = randomUUID();

  try {
    if (!id.trim() || id.includes("/")) {
      return NextResponse.json({ error: { code: "INVALID_ACTIVITY_ID", message: "Invalid activity ID", requestId } }, { status: 400 });
    }

    console.info("[analysis] POST request", { requestId, activityId: id });

    const database = getDb();

    // Build context
    const context = await buildActivityAnalysisContext(id, database);

    // Call Gemini
    const client = new GeminiAnalysisClient();
    const { response, model, promptVersion } = await client.analyze(context);

    // Persist analysis
    const analysisRepo = createAnalysisRepository(database);
    const analysis = await analysisRepo.create({
      id: randomUUID(),
      intervalsActivityId: id,
      deterministicMetricsJson: JSON.stringify({
        threshold: context.thresholdEstimate,
        segmentZones: context.segmentZones,
        historicalComparison: context.historicalComparison,
      }),
      historicalComparisonJson: JSON.stringify(context.historicalComparison),
      llmResponseJson: serializeJson(activityAnalysisResponseSchema, response),
      llmModel: model,
      promptVersion: promptVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      id: analysis.id,
      activityId: id,
      analysis: response,
      formatOutdated: false,
      logicStale: false,
      thresholdEstimate: toClientThresholdEstimate(context.thresholdEstimate),
      historicalComparison: context.historicalComparison ? toClientHistoricalComparison(context.historicalComparison) : null,
      model: analysis.llmModel,
      promptVersion: analysis.promptVersion,
      currentPromptVersion: DEBRIEF_PROMPT_VERSION,
      createdAt: analysis.createdAt,
    });
  } catch (error) {
    console.error("[analysis] POST error", { requestId, message: error instanceof Error ? error.message : "unknown" });

    const message = error instanceof Error ? error.message : "An error occurred";
    if (message.includes("not found")) {
      return NextResponse.json({ error: { code: "ACTIVITY_NOT_FOUND", message: "Activity not found", requestId } }, { status: 404 });
    }
    if (message.includes("GEMINI_API_KEY")) {
      return NextResponse.json({ error: { code: "GEMINI_NOT_CONFIGURED", message: "Gemini API key not configured", requestId } }, { status: 503 });
    }
    if (message.includes("quota")) {
      return NextResponse.json({ error: { code: "GEMINI_QUOTA", message: "Gemini API quota exceeded", requestId } }, { status: 429 });
    }

    return NextResponse.json({ error: { code: "ANALYSIS_FAILED", message: message, requestId } }, { status: 500 });
  }
}
