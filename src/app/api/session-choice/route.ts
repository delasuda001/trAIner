import { NextResponse } from "next/server";
import { z } from "zod";
import { featureEnabled } from "@/lib/env/environment";
import { apiAsMember } from "@/lib/profiles/request";
import { saveSessionChoice } from "@/lib/server/session-choice";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ key: z.string().regex(/^[a-z_]{2,40}$/).nullable(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Choix d'un plan B ou C (ou retour à la séance recommandée) : la suite de la semaine est recalculée. */
export async function POST(request: Request) {
  if (!featureEnabled("session_options")) return NextResponse.json({ error: "Indisponible." }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choix invalide." }, { status: 400 });
  return apiAsMember(() => {
    saveSessionChoice(parsed.data.key, parsed.data.date);
    return NextResponse.json({ ok: true });
  });
}
