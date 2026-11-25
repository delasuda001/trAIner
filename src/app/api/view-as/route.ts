import { NextResponse } from "next/server";
import { z } from "zod";
import { getRegistry } from "@/lib/profiles/context";
import { requestAccount, VIEW_AS_COOKIE, VIEW_AS_LOG_KEY } from "@/lib/profiles/request";
import { relativeRedirect } from "@/lib/profiles/session-http";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string().min(1).max(40) });
const logSchema = z.array(z.string()).max(50);

/**
 * « Voir comme » (Bastien seul) : ouvre l'espace d'un invité tel qu'il le voit, en lecture seule
 * (le proxy refuse toute écriture). Chaque ouverture est notée et montrée à l'invité (Paramètres).
 */
export async function POST(request: Request) {
  const account = await requestAccount();
  if (account?.role !== "admin") return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const registry = getRegistry();
  const record = parsed.success ? registry.find(parsed.data.id) : null;
  if (!record || record.role !== "guest") return NextResponse.json({ error: "Invité inconnu." }, { status: 404 });
  const log = registry.getSetting(VIEW_AS_LOG_KEY(record.id), logSchema) ?? [];
  registry.setSetting(VIEW_AS_LOG_KEY(record.id), [new Date().toISOString(), ...log].slice(0, 20));
  const response = NextResponse.json({ ok: true });
  // Cookie de session de navigateur (pas de durée) : le « voir comme » ne survit pas à la fermeture.
  response.cookies.set(VIEW_AS_COOKIE, record.id, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https", path: "/" });
  return response;
}

/** Retour au compte de Bastien. */
export function GET() {
  const response = relativeRedirect("/parametres");
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
