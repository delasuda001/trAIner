import { NextResponse } from "next/server";
import { createActivityRepository } from "@/lib/db/repositories/activity-repository";
import { createFeelingRepository, feelingInputSchema } from "@/lib/db/repositories/feeling-repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const id = decodeURIComponent((await params).id);
  if (!createActivityRepository().findById(id)) return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  const parsed = feelingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ressenti invalide (effort de 1 à 10, note de 600 caractères au plus)." }, { status: 400 });
  return NextResponse.json({ feeling: createFeelingRepository().save(id, parsed.data) });
}
