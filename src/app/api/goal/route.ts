import { NextResponse } from "next/server";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { EMPTY_GOAL, GOAL_KEY, goalSchema } from "@/lib/goal/goal";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(createAppStateRepository().get(GOAL_KEY, goalSchema) ?? EMPTY_GOAL);
}

export async function PUT(request: Request) {
  const parsed = goalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Objectif invalide", issues: parsed.error.issues.map((issue) => issue.path.join(".")) }, { status: 400 });
  createAppStateRepository().set(GOAL_KEY, parsed.data);
  return NextResponse.json(parsed.data);
}
