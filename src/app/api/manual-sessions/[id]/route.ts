import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type AppDatabase } from "@/lib/db/client";
import { manualSessionInputSchema } from "@/lib/db/contracts";
import { createManualSessionRepository } from "@/lib/db/repositories/manual-session-repository";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteParams) {
  const { id } = await context.params;
  return updateManualSession(request, id, getDb());
}

export async function updateManualSession(request: Request, id: string, database: AppDatabase) {
  const requestId = randomUUID();
  try {
    const payload: unknown = await request.json();
    const input = manualSessionInputSchema.partial().strict().parse(payload);
    const session = await createManualSessionRepository(database).update(id, input);
    if (!session) return errorResponse("NOT_FOUND", "Activité manuelle introuvable", requestId, 404);
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("VALIDATION_ERROR", "Vérifiez les champs de l’activité manuelle", requestId, 400);
    console.error("[manual-sessions] update error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse("DATABASE_ERROR", "L’activité manuelle n’a pas pu être modifiée", requestId, 500);
  }
}

export async function DELETE(_request: Request, context: RouteParams) {
  const { id } = await context.params;
  return deleteManualSession(id, getDb());
}

export async function deleteManualSession(id: string, database: AppDatabase) {
  const requestId = randomUUID();
  try {
    const repository = createManualSessionRepository(database);
    if (!(await repository.findById(id))) return errorResponse("NOT_FOUND", "Activité manuelle introuvable", requestId, 404);
    await repository.remove(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[manual-sessions] delete error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse("DATABASE_ERROR", "L’activité manuelle n’a pas pu être supprimée", requestId, 500);
  }
}

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId } }, { status });
}