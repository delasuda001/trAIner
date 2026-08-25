import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type AppDatabase } from "@/lib/db/client";
import { athleteContextSchema, parseJson, serializeJson } from "@/lib/db/contracts";
import { createAthleteContextRepository } from "@/lib/db/repositories/athlete-context-repository";

const inputSchema = z.object({ context: athleteContextSchema, sourceText: z.string().trim().max(2000).optional() }).strict();

export async function GET() {
  return getContext(getDb());
}

export async function getContext(database: AppDatabase) {
  const requestId = randomUUID();
  try { const row = await createAthleteContextRepository(database).findActive(); return NextResponse.json(row ? { id: row.id, createdAt: row.createdAt, activatedAt: row.activatedAt, context: parseJson(athleteContextSchema, row.contextJson) } : null); }
  catch (error) { console.error("[context] read error", { requestId, message: error instanceof Error ? error.message : "unknown" }); return errorResponse("DATABASE_ERROR", "Le contexte est indisponible", requestId, 500); }
}

export async function PUT(request: Request) {
  return putContext(request, getDb());
}

export async function putContext(request: Request, database: AppDatabase) {
  const requestId = randomUUID();
  try { const payload: unknown = await request.json(); const input = inputSchema.parse(payload); const now = new Date().toISOString(); const row = await createAthleteContextRepository(database).createAndActivate({ id: randomUUID(), status: "active", contextJson: serializeJson(athleteContextSchema, input.context), sourceText: input.sourceText || null, createdAt: now, activatedAt: now, archivedAt: null, updatedAt: now }); return NextResponse.json({ id: row.id, createdAt: row.createdAt, activatedAt: row.activatedAt, context: input.context }); }
  catch (error) { if (error instanceof z.ZodError) return errorResponse("VALIDATION_ERROR", "Vérifiez les informations du contexte", requestId, 400); console.error("[context] write error", { requestId, message: error instanceof Error ? error.message : "unknown" }); return errorResponse("DATABASE_ERROR", "Le contexte n’a pas pu être enregistré", requestId, 500); }
}

function errorResponse(code: string, message: string, requestId: string, status: number) { return NextResponse.json({ error: { code, message, requestId } }, { status }); }