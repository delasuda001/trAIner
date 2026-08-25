import { NextResponse } from "next/server";
import { getActivity, IntervalsApiError, IntervalsValidationError } from "@/lib/intervals/client";
import { randomUUID } from "node:crypto";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  try {
    const { id } = await params;
    if (!id.trim() || id.includes("/")) return errorResponse("INVALID_ACTIVITY_ID", "Identifiant d’activité invalide", requestId, 400);
    console.info("[activity] detail request", { requestId, activityId: id });
    return NextResponse.json(await getActivity(id, requestId));
  }
  catch (error) {
    if (error instanceof IntervalsValidationError) return errorResponse("INTERVALS_VALIDATION_ERROR", "Les données de cette activité sont invalides", requestId, 502);
    if (error instanceof IntervalsApiError) {
      if (error.status === 404) return errorResponse("INTERVALS_NOT_FOUND", "Activité introuvable", requestId, 404);
      return errorResponse("INTERVALS_API_ERROR", "Intervals.icu n’a pas pu fournir cette activité", requestId, error.status >= 400 && error.status < 600 ? 502 : 500);
    }
    console.error("[activity] unexpected error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse("INTERNAL_ERROR", "Une erreur interne est survenue", requestId, 500);
  }
}

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId } }, { status });
}