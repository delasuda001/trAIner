import { deviceLabel, looksLikeToken } from "@/lib/profiles/credentials";
import { getRegistry } from "@/lib/profiles/context";
import { clientAddress, guestsSuspended } from "@/lib/profiles/request";
import { loginThrottle, openSession, relativeRedirect } from "@/lib/profiles/session-http";

export const dynamic = "force-dynamic";

/**
 * Lien d'invitation personnel : `/api/session/invitation?t=…`. Usage unique,
 * valable 7 jours ; ouvre la session sur l'appareil puis envoie vers l'accueil.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
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
