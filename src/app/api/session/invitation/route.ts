import { deviceLabel, looksLikeToken } from "@/lib/profiles/credentials";
import { getRegistry } from "@/lib/profiles/context";
import { clientAddress, guestsSuspended } from "@/lib/profiles/request";
import { loginThrottle, openSession, relativeRedirect } from "@/lib/profiles/session-http";

export const dynamic = "force-dynamic";

/**
 * Lien d'invitation personnel : `/api/session/invitation?t=…`. Usage unique,
 * valable 7 jours. Le GET ne consomme rien : il renvoie vers une page de
 * confirmation (les robots d'aperçu des messageries ouvrent le lien avant la
 * personne et prenaient sa place). Le POST du bouton consomme le lien, ouvre la
 * session sur l'appareil puis envoie vers l'accueil.
 */
export function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!looksLikeToken(token)) return relativeRedirect("/connexion?invitation=invalide");
  return relativeRedirect(`/connexion/invitation?t=${encodeURIComponent(token)}`);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const raw = form?.get("t");
  const token = typeof raw === "string" ? raw : null;
  const address = clientAddress(request.headers);
  const device = deviceLabel(request.headers.get("user-agent"));
  const registry = getRegistry();
  const now = Date.now();
  if (loginThrottle.lockedFor(address, now)) {
    registry.logLogin({ profileId: null, method: "invitation", outcome: "locked", address, device });
    return relativeRedirect("/connexion?invitation=bloquee");
  }
  const record = looksLikeToken(token) ? registry.consumeInvitation(token) : null;
  if (!record || (record.role === "guest" && guestsSuspended())) {
    loginThrottle.fail(address, now);
    registry.logLogin({ profileId: null, method: "invitation", outcome: "refused", address, device });
    return relativeRedirect("/connexion?invitation=invalide");
  }
  registry.logLogin({ profileId: record.id, method: "invitation", outcome: "ok", address, device });
  return openSession(relativeRedirect(record.onboardedAt ? "/" : "/bienvenue"), request, record);
}
