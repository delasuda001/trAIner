import { NextResponse } from "next/server";
import { z } from "zod";
import { COACH_MODEL_KEY, COACH_MODELS } from "@/lib/coach";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { apiAsAdmin } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({ model: z.enum(COACH_MODELS) });

/** Choix du modèle : réservé à Bastien (les invités restent sur Sonnet). */
export async function PUT(request: Request) {
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Modèle inconnu" }, { status: 400 });
  return apiAsAdmin(() => {
    createAppStateRepository().set(COACH_MODEL_KEY, parsed.data.model);
    return NextResponse.json(parsed.data);
  });
}
