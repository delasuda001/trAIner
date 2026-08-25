import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, type AppDatabase } from "@/lib/db/client";
import { createGoalRepository } from "@/lib/db/repositories/goal-repository";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; return archiveGoal(id, getDb()); }
export async function archiveGoal(id: string, database: AppDatabase) { const requestId = randomUUID(); try { const goal = await createGoalRepository(database).archive(id); return goal ? NextResponse.json(goal) : NextResponse.json({ error: { code: "NOT_FOUND", message: "Objectif introuvable", requestId } }, { status: 404 }); } catch { return NextResponse.json({ error: { code: "DATABASE_ERROR", message: "L’objectif n’a pas pu être archivé", requestId } }, { status: 500 }); } }