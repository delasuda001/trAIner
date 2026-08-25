import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type AppDatabase } from "@/lib/db/client";
import { IntervalsApiError, IntervalsValidationError } from "@/lib/intervals/client";
import { synchronizeRunningActivities } from "@/lib/intervals/sync";

const bodySchema = z.object({ weeks: z.number().int().min(1).max(52).default(12) }).strict();

export async function POST(request: Request) {
  return handlePost(request, getDb());
}

export async function handlePost(request: Request, database: AppDatabase) {
  const requestId = randomUUID();
  try {
    const rawBody: unknown = await request.json().catch(() => ({}));
    const body = bodySchema.parse(rawBody);
    return NextResponse.json(await synchronizeRunningActivities({ weeks: body.weeks, requestId, database }));
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("INVALID_WEEKS", "La période doit être un entier compris entre 1 et 52 semaines", requestId, 400);
    if (error instanceof IntervalsValidationError) return errorResponse("INTERVALS_VALIDATION_ERROR", "La réponse globale d’Intervals.icu est invalide", requestId, 502);
    if (error instanceof IntervalsApiError) return errorResponse(error.status === 429 ? "INTERVALS_RATE_LIMITED" : "INTERVALS_API_ERROR", error.status === 429 ? "Intervals.icu limite temporairement les requêtes" : "Intervals.icu est indisponible", requestId, error.status === 429 ? 429 : 502, error.retryAfter);
    console.error("[sync] unexpected error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse("INTERNAL_ERROR", "La synchronisation a échoué", requestId, 500);
  }
}

function errorResponse(code: string, message: string, requestId: string, status: number, retryAfter?: string) {
  return NextResponse.json({ error: { code, message, requestId } }, { status, headers: retryAfter ? { "Retry-After": retryAfter } : undefined });
}