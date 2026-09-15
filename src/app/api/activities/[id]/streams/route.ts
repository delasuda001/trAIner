import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import type { AppDatabase } from "@/lib/db/client";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { createStreamSummaryRepository } from "@/lib/db/repositories/stream-summary-repository";
import { IntervalsApiError, IntervalsValidationError } from "@/lib/intervals/client";
import { fetchActivityStreams } from "@/lib/intervals/stream-client";
import { normalizeActivityStreams } from "@/lib/intervals/stream-mapper";
import { computeStreamSummary, STREAM_SUMMARY_VERSION } from "@/lib/analysis/stream-summary";
import type { NormalizedStreams } from "@/lib/db/contracts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getActivityStreams(id, getDb());
}

export async function getActivityStreams(id: string, database: AppDatabase) {
  const requestId = randomUUID();
  try {
    const activity = await createSyncedActivityRepository(database).findByExternalId(id);
    if (!activity) return errorResponse("LOCAL_ACTIVITY_NOT_FOUND", "Activité absente du catalogue local", requestId, 404);
    const raw = await fetchActivityStreams(id, { requestId, activityId: id });
    const normalized = normalizeActivityStreams(id, raw);
    await persistStreamSummary(database, id, normalized, requestId);
    return NextResponse.json(normalized);
  } catch (error) {
    if (error instanceof IntervalsValidationError || error instanceof Error && error.message === "Réponse streams invalide") return errorResponse("INTERVALS_VALIDATION_ERROR", "Les streams de cette activité sont invalides", requestId, 502);
    if (error instanceof IntervalsApiError) return errorResponse("INTERVALS_API_ERROR", "Les streams ne sont pas disponibles", requestId, 502);
    console.error("[streams] unexpected error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse("INTERNAL_ERROR", "Les streams ne peuvent pas être chargés", requestId, 500);
  }
}
function errorResponse(code: string, message: string, requestId: string, status: number) { return NextResponse.json({ error: { code, message, requestId } }, { status }); }

/**
 * Persiste le résumé dérivé (meilleurs efforts + FC moyenne) pour l'activité.
 * Best-effort : un échec de persistance ne doit pas priver l'utilisateur de
 * ses courbes, il est seulement loggé.
 */
async function persistStreamSummary(database: AppDatabase, id: string, normalized: NormalizedStreams, requestId: string): Promise<void> {
  try {
    const summary = computeStreamSummary(normalized);
    const now = new Date().toISOString();
    await createStreamSummaryRepository(database).upsert({
      id: randomUUID(),
      intervalsActivityId: id,
      streamVersion: STREAM_SUMMARY_VERSION,
      summaryJson: JSON.stringify(summary),
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error("[streams] stream summary persistence failed", { requestId, activityId: id, message: error instanceof Error ? error.message : "unknown" });
  }
}