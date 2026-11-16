import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { deviceLabel, looksLikeToken, plausibleCode, SESSION_COOKIE } from "@/lib/profiles/credentials";
import { getRegistry } from "@/lib/profiles/context";
import { clientAddress, guestsSuspended } from "@/lib/profiles/request";
import { loginThrottle, openSession } from "@/lib/profiles/session-http";

export const dynamic = "force-dynamic";

const loginSchema = z.object({ code: z.string().max(80) });

/** Message unique pour tout refus : aucun indice sur l'existence d'un profil. */
const REFUSED = "Code non reconnu.";

/** Connexion par code de secours (le lien d'invitation, lui, ne demande rien à taper). */
export async function POST(request: Request) {
  const address = clientAddress(request.headers);
  const device = deviceLabel(request.headers.get("user-agent"));
  const registry = getRegistry();
  const now = Date.now();
  const locked = loginThrottle.lockedFor(address, now);
  if (locked) {
    registry.logLogin({ profileId: null, method: "code", outcome: "locked", address, device });
    return NextResponse.json({ error: `Trop d'essais : réessaie dans ${Math.ceil(locked / 60_000)} min.` }, { status: 429 });
  }
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  const record = parsed.success && plausibleCode(parsed.data.code) ? registry.findByCode(parsed.data.code) : null;
  if (!record || (record.role === "guest" && guestsSuspended())) {
    loginThrottle.fail(address, now);
    registry.logLogin({ profileId: null, method: "code", outcome: "refused", address, device });
    return NextResponse.json({ error: REFUSED }, { status: 401 });
  }
  loginThrottle.succeed(address);
  registry.logLogin({ profileId: record.id, method: "code", outcome: "ok", address, device });
  return openSession(NextResponse.json({ ok: true, onboarding: record.onboardedAt == null }), request, record);
}

/** Déconnexion de cet appareil (la session est révoquée côté serveur). */
export async function DELETE() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (looksLikeToken(token)) getRegistry().endSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
