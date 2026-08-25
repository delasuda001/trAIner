import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import type { AppDatabase } from "@/lib/db/client";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { IntervalsApiError, IntervalsValidationError } from "@/lib/intervals/client";
import { fetchActivityStreams } from "@/lib/intervals/stream-client";
import { normalizeActivityStreams } from "@/lib/intervals/stream-mapper";

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
    return NextResponse.json(normalizeActivityStreams(id, raw));
  } catch (error) {
    if (error instanceof IntervalsValidationError || error instanceof Error && error.message === "Réponse streams invalide") return errorResponse("INTERVALS_VALIDATION_ERROR", "Les streams de cette activité sont invalides", requestId, 502);
    if (error instanceof IntervalsApiError) return errorResponse("INTERVALS_API_ERROR", "Les streams ne sont pas disponibles", requestId, 502);
    console.error("[streams] unexpected error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse("INTERNAL_ERROR", "Les streams ne peuvent pas être chargés", requestId, 500);
  }
}
function errorResponse(code: string, message: string, requestId: string, status: number) { return NextResponse.json({ error: { code, message, requestId } }, { status }); }