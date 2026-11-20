import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { addDeclaredRun, DECLARED_RUNS_KEY, declaredRunInputSchema, declaredRunsSchema, removeDeclaredRun } from "@/lib/declared-runs";
import { apiAsMember } from "@/lib/profiles/request";
import { loadContext } from "@/lib/server/analytics";

export const dynamic = "force-dynamic";

/** Déclarer une sortie courue sans montre (date, durée) pour le profil actif. */
export async function POST(request: Request) {
  const parsed = declaredRunInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Date et durée (5 à 600 min) attendues." }, { status: 400 });
  return apiAsMember(() => {
    const repository = createAppStateRepository();
    try {
      const next = addDeclaredRun(repository.get(DECLARED_RUNS_KEY, declaredRunsSchema) ?? [], parsed.data, randomUUID().slice(0, 12), loadContext().today);
      repository.set(DECLARED_RUNS_KEY, next);
      return NextResponse.json({ runs: next });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Déclaration impossible." }, { status: 400 });
    }
  });
}

const deleteSchema = z.object({ id: z.string().min(1).max(40) });

export async function DELETE(request: Request) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Identifiant attendu." }, { status: 400 });
  return apiAsMember(() => {
    const repository = createAppStateRepository();
    const next = removeDeclaredRun(repository.get(DECLARED_RUNS_KEY, declaredRunsSchema) ?? [], parsed.data.id);
    repository.set(DECLARED_RUNS_KEY, next);
    return NextResponse.json({ runs: next });
  });
}
