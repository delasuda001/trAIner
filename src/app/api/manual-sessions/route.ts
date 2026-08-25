import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type AppDatabase } from "@/lib/db/client";
import { manualSessionInputSchema } from "@/lib/db/contracts";
import { createManualSessionRepository } from "@/lib/db/repositories/manual-session-repository";

const querySchema = z.object({ from: z.string().optional(), to: z.string().optional() }).strict();

export async function GET(request: Request) {
  return getManualSessions(request, getDb());
}

export async function getManualSessions(request: Request, database: AppDatabase) {
  const requestId = randomUUID();
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const sessions = await createManualSessionRepository(database).findByPeriod(query.from ?? "0000-01-01", query.to ?? "9999-12-31");
    return NextResponse.json(sessions);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("VALIDATION_ERROR", "Les dates demandées sont invalides", requestId, 400);
    console.error("[manual-sessions] read error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse("DATABASE_ERROR", "Les activités manuelles sont indisponibles", requestId, 500);
  }
}

export async function POST(request: Request) {
  return createManualSession(request, getDb());
}

export async function createManualSession(request: Request, database: AppDatabase) {
  const requestId = randomUUID();
  try {
    const payload: unknown = await request.json();
    const input = manualSessionInputSchema.parse(payload);
    const now = new Date().toISOString();
    const session = await createManualSessionRepository(database).create({ id: randomUUID(), ...input, label: input.label || null, note: input.note || null, createdAt: now, updatedAt: now });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("VALIDATION_ERROR", "Vérifiez la date, le type, la durée et les textes saisis", requestId, 400);
    console.error("[manual-sessions] create error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse("DATABASE_ERROR", "L’activité manuelle n’a pas pu être enregistrée", requestId, 500);
  }
}

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId } }, { status });
}