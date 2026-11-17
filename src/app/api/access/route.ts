import { NextResponse } from "next/server";
import { z } from "zod";
import { getRegistry } from "@/lib/profiles/context";
import { apiAsAdmin, GUESTS_SUSPENDED_KEY } from "@/lib/profiles/request";
import { PUBLIC_URL_KEY, TRAINING_OPT_OUT_KEY } from "@/lib/server/profiles-admin";
import { GUESTS_WEEKLY_CAP_KEY } from "@/lib/server/quota";

export const dynamic = "force-dynamic";

const accessSchema = z.object({
  guestsSuspended: z.boolean().optional(),
  guestsWeeklyCap: z.number().int().min(0).max(20_000_000).optional(),
  publicUrl: z.string().trim().url().startsWith("https://").nullable().optional(),
  trainingOptOut: z.boolean().optional(),
});

/** Réglages d'accès des invités (Bastien seulement). */
export async function PUT(request: Request) {
  const parsed = accessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Réglage invalide (l'adresse publique doit commencer par https://)." }, { status: 400 });
  return apiAsAdmin(() => {
    const registry = getRegistry();
    if (parsed.data.guestsSuspended !== undefined) registry.setSetting(GUESTS_SUSPENDED_KEY, parsed.data.guestsSuspended);
    if (parsed.data.guestsWeeklyCap !== undefined) registry.setSetting(GUESTS_WEEKLY_CAP_KEY, parsed.data.guestsWeeklyCap);
    if (parsed.data.publicUrl !== undefined) registry.setSetting(PUBLIC_URL_KEY, parsed.data.publicUrl);
    if (parsed.data.trainingOptOut !== undefined) registry.setSetting(TRAINING_OPT_OUT_KEY, parsed.data.trainingOptOut);
    return NextResponse.json({ ok: true });
  });
}
