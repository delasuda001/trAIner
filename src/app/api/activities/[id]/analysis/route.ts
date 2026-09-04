import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { createAnalysisRepository } from "@/lib/db/repositories/analysis-repository";
import { buildActivityAnalysisContext } from "@/lib/llm/context";
import { GeminiAnalysisClient } from "@/lib/llm/gemini-client";
import { serializeJson } from "@/lib/db/contracts";
import { activityAnalysisResponseSchema } from "@/lib/llm/schemas";

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

    const llmResponse = JSON.parse(latest.llmResponseJson);
    return NextResponse.json({
      id: latest.id,
      activityId: id,
      analysis: llmResponse,
      model: latest.llmModel,
      promptVersion: latest.promptVersion,
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
      model: analysis.llmModel,
      promptVersion: analysis.promptVersion,
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
