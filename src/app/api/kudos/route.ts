import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { KUDOS_SEEN_KEY } from "@/lib/server/kudos";
import { apiAsMember } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string().min(1).max(120) });

/** Félicitations vues pour cette séance : elles ne reviennent plus, sur aucun appareil du profil. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Séance manquante." }, { status: 400 });
  return apiAsMember(() => {
    createAppStateRepository().set(KUDOS_SEEN_KEY, parsed.data.id);
    return NextResponse.json({ ok: true });
  });
}
