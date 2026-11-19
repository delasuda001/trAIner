import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAsAdmin } from "@/lib/profiles/request";
import { createGuestProfile, publicUrl } from "@/lib/server/profiles-admin";

export const dynamic = "force-dynamic";

const createSchema = z.object({ name: z.string().trim().min(2).max(30) });

/** Crée un profil invité (Bastien seulement). */
export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Prénom de 2 à 30 caractères." }, { status: 400 });
  return apiAsAdmin(() => {
    const created = createGuestProfile(parsed.data.name, publicUrl(new URL(request.url).origin).url);
    if (!created.record) return NextResponse.json({ error: "Création impossible." }, { status: 500 });
    return NextResponse.json({ id: created.record.id, name: created.record.name, garminEnvVar: created.record.garminEnvVar, code: created.code, url: created.url });
  });
}
