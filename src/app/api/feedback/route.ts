import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/profiles/context";
import { feedbackInputSchema } from "@/lib/profiles/registry";
import { apiAsAdmin, apiAsMember } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

/** Un retour (note libre et/ou pouce), rattaché au profil connecté. Stocké en local (registre). */
export async function POST(request: Request) {
  const parsed = feedbackInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Retour invalide (2 000 caractères au plus)." }, { status: 400 });
  if (parsed.data.rating == null && parsed.data.note.length < 2) return NextResponse.json({ error: "Écris quelques mots." }, { status: 400 });
  return apiAsMember((member) => {
    const registry = getRegistry();
    const saved = parsed.data.rating != null ? registry.rateSubject(member.id, parsed.data) : registry.addFeedback(member.id, parsed.data);
    return NextResponse.json({ id: saved.id });
  });
}

/** Bastien peut supprimer un retour (doublon, essai). */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return apiAsAdmin(() => {
    getRegistry().deleteFeedback(id);
    return NextResponse.json({ ok: true });
  });
}
