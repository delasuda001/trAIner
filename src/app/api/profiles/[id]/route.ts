import { NextResponse } from "next/server";
import { z } from "zod";
import { getRegistry, toMember } from "@/lib/profiles/context";
import { preparationAllowed, readPrepareStatus, startPreparation } from "@/lib/server/prepare-service";
import { ADMIN_ID } from "@/lib/profiles/registry";
import { apiAsAdmin } from "@/lib/profiles/request";
import { capsSchema } from "@/lib/profiles/types";
import { checkGarminKey } from "@/lib/source/garmin";
import { newCode, newInvitation, publicUrl } from "@/lib/server/profiles-admin";
import { reloadEnv } from "@/lib/server/sync-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invitation") }),
  z.object({ action: z.literal("code") }),
  z.object({ action: z.literal("caps"), caps: capsSchema }),
  z.object({ action: z.literal("rename"), name: z.string().trim().min(2).max(30) }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("revoke-all") }),
  z.object({ action: z.literal("check-garmin") }),
  z.object({ action: z.literal("prepare") }),
]);

/** État de la préparation d'un invité (suivi dans Paramètres). */
export async function GET(_request: Request, { params }: Params) {
  const id = (await params).id;
  return apiAsAdmin(() => {
    const record = getRegistry().find(id);
    if (!record) return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });
    return NextResponse.json({ status: readPrepareStatus(id), guard: preparationAllowed(toMember(record)) });
  });
}

/** Actions de Bastien sur un profil. Le lien et le code ne sont renvoyés qu'une fois, jamais relus. */
export async function POST(request: Request, { params }: Params) {
  const id = (await params).id;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  return apiAsAdmin(async () => {
    const registry = getRegistry();
    const record = registry.find(id);
    if (!record) return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });
    const body = parsed.data;
    switch (body.action) {
      case "invitation":
        return NextResponse.json(newInvitation(id, publicUrl(new URL(request.url).origin).url));
      case "code":
        return NextResponse.json(newCode(id));
      case "caps":
        if (record.role === "admin") return NextResponse.json({ error: "Pas de plafond pour l'administrateur." }, { status: 400 });
        registry.setCaps(id, body.caps);
        return NextResponse.json({ ok: true });
      case "rename":
        registry.rename(id, body.name);
        return NextResponse.json({ ok: true });
      case "disable":
      case "enable":
        if (id === ADMIN_ID) return NextResponse.json({ error: "Le profil administrateur ne se désactive pas." }, { status: 400 });
        registry.setDisabled(id, body.action === "disable");
        return NextResponse.json({ ok: true });
      case "revoke-all":
        registry.revokeAllSessions(id);
        return NextResponse.json({ ok: true });
      case "check-garmin":
        reloadEnv();
        return NextResponse.json(await checkGarminKey(record.garminEnvVar, true));
      case "prepare": {
        if (record.role !== "guest") return NextResponse.json({ error: "Seul un invité se prépare." }, { status: 400 });
        reloadEnv();
        const garmin = await checkGarminKey(record.garminEnvVar, false);
        if (!garmin.present) return NextResponse.json({ error: `Clé Garmin absente : ajoute ${record.garminEnvVar}=… à .env.local.` }, { status: 400 });
        // La garde de l'abonnement est vérifiée avant de lancer : bouton bloqué côté interface, refus ici aussi.
        const guard = preparationAllowed(toMember(record));
        if (!guard.allowed) return NextResponse.json({ error: guard.message ?? "Abonnement trop chargé pour l'instant." }, { status: 409 });
        return NextResponse.json({ started: startPreparation(id) });
      }
    }
  });
}
