import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type AppDatabase } from "@/lib/db/client";
import { goalInputSchema } from "@/lib/db/contracts";
import { createGoalRepository } from "@/lib/db/repositories/goal-repository";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; return updateGoal(request, id, getDb()); }
export async function updateGoal(request: Request, id: string, database: AppDatabase) { const requestId = randomUUID(); try { const input = goalInputSchema.partial().strict().parse(await request.json()); const changes = { ...input, definitionJson: input.definition ? JSON.stringify(input.definition) : undefined }; delete changes.definition; const goal = await createGoalRepository(database).update(id, changes); if (!goal) return errorResponse("NOT_FOUND", "Objectif introuvable", requestId, 404); return NextResponse.json(goal); } catch (error) { if (error instanceof z.ZodError) return errorResponse("VALIDATION_ERROR", "Vérifiez les champs de l’objectif", requestId, 400); if (error instanceof Error && error.message.includes("Un seul objectif")) return errorResponse("VALIDATION_ERROR", error.message, requestId, 409); return errorResponse("DATABASE_ERROR", "L’objectif n’a pas pu être modifié", requestId, 500); } }
function errorResponse(code: string, message: string, requestId: string, status: number) { return NextResponse.json({ error: { code, message, requestId } }, { status }); }