import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { deviceLabel, GUEST_CODE_LENGTH, looksLikeToken, normalizeCode, plausibleCode, SESSION_COOKIE } from "@/lib/profiles/credentials";
import { getRegistry } from "@/lib/profiles/context";
import { isTestEnv } from "@/lib/env/environment";
import { clientAddress, guestsSuspended } from "@/lib/profiles/request";
import { loginThrottle, openSession } from "@/lib/profiles/session-http";

export const dynamic = "force-dynamic";

const loginSchema = z.object({ name: z.string().max(40).optional(), code: z.string().max(80) });

/** Message unique pour tout refus : aucun indice sur l'existence d'un profil. */
const REFUSED = "Prénom ou code non reconnu.";

/**
 * Connexion : prénom + code personnel (6 chiffres pour un invité, code long pour Bastien). Sans prénom, seul
 * un code long est accepté (anciens codes de secours) : un code à 6 chiffres seul serait trop facile à deviner.
 */
export async function POST(request: Request) {
  const address = clientAddress(request.headers);
  const device = deviceLabel(request.headers.get("user-agent"));
  const registry = getRegistry();
  const now = Date.now();
  const locked = loginThrottle.lockedFor(address, now);
  if (locked) {
    registry.logLogin({ profileId: null, method: "code", outcome: "locked", address, device });
    return NextResponse.json({ error: `Trop d'essais : merci de réessayer dans ${Math.ceil(locked / 60_000)} min.` }, { status: 429 });
  }
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  const name = parsed.success ? parsed.data.name?.trim() ?? "" : "";
  const code = parsed.success ? parsed.data.code : "";
  const longCode = normalizeCode(code).length > GUEST_CODE_LENGTH;
  const record = !parsed.success || !plausibleCode(code) ? null : name ? registry.findByNameAndCode(name, code) : longCode ? registry.findByCode(code) : null;
  if (!record || (record.role === "guest" && guestsSuspended()) || (isTestEnv() && record.role !== "admin")) {
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
