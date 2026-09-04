import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { createActivityContextRepository } from "@/lib/db/repositories/activity-context-repository";

const contextInputSchema = z.object({
  sessionGoal: z.string().max(500).nullable(),
  perceivedExertion: z.string().max(100).nullable(),
  unusualFatigue: z.boolean(),
  painFlag: z.boolean(),
  note: z.string().max(2000).nullable(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await createActivityContextRepository(getDb()).findByActivityId(id);
  return context ? NextResponse.json(context) : NextResponse.json(null);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = randomUUID();
  try {
    if (!id.trim() || id.includes("/")) return NextResponse.json({ error: { code: "INVALID_ACTIVITY_ID", message: "Identifiant d’activité invalide", requestId } }, { status: 400 });
    const input = contextInputSchema.parse(await request.json());
    const now = new Date().toISOString();
    const context = await createActivityContextRepository(getDb()).upsert({ id: randomUUID(), intervalsActivityId: id, sessionGoal: input.sessionGoal || null, perceivedExertion: input.perceivedExertion || null, unusualFatigue: input.unusualFatigue ? 1 : 0, painFlag: input.painFlag ? 1 : 0, note: input.note || null, createdAt: now, updatedAt: now });
    return NextResponse.json(context);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Le contexte de séance est invalide", requestId } }, { status: 400 });
    console.error("[activity-context] write error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: { code: "DATABASE_ERROR", message: "Le contexte n’a pas pu être enregistré", requestId } }, { status: 500 });
  }
}