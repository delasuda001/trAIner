import { NextResponse } from "next/server";
import { z } from "zod";
import { getRegistry } from "@/lib/profiles/context";
import { apiAsAdmin } from "@/lib/profiles/request";
import { TEST_COACH_SIMULATED_KEY } from "@/lib/profiles/test-profile";
import { publicUrl } from "@/lib/server/profiles-admin";
import { resetTestProfile } from "@/lib/server/test-profile-service";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("coach"), simulated: z.boolean() }),
]);

/** Profil invité de test de Bastien : (ré)initialisation et coach simulé. Bastien seulement. */
export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  const body = parsed.data;
  return apiAsAdmin(async () => {
    if (body.action === "coach") {
      getRegistry().setSetting(TEST_COACH_SIMULATED_KEY, body.simulated);
      return NextResponse.json({ ok: true });
    }
    try {
      return NextResponse.json(await resetTestProfile(publicUrl(new URL(request.url).origin).url));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Réinitialisation impossible." }, { status: 409 });
    }
  });
}
