import { isTestEnv } from "@/lib/env/environment";
import { verifyHandoffToken } from "@/lib/env/handoff";
import { getRegistry } from "@/lib/profiles/context";
import { clientAddress } from "@/lib/profiles/request";
import { openSession, relativeRedirect } from "@/lib/profiles/session-http";
import { deviceLabel } from "@/lib/profiles/credentials";

export const dynamic = "force-dynamic";

const globalForHandoff = globalThis as typeof globalThis & { sillageUsedHandoffs?: Set<string> };
const used = (globalForHandoff.sillageUsedHandoffs ??= new Set<string>());

/** Arrivée depuis la prod (environnement de test seulement) : jeton signé, usage unique, administrateur seulement. */
export function GET(request: Request) {
  if (!isTestEnv()) return relativeRedirect("/");
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const verified = used.has(token) ? null : verifyHandoffToken(token, process.env.SILLAGE_ENV_SECRET ?? "");
  const registry = getRegistry();
  const record = verified ? registry.find(verified.memberId) : null;
  const device = deviceLabel(request.headers.get("user-agent"));
  if (!record || record.role !== "admin" || record.disabledAt) {
    registry.logLogin({ profileId: null, method: "code", outcome: "refused", address: clientAddress(request.headers), device });
    return relativeRedirect("/connexion");
  }
  used.add(token);
  return openSession(relativeRedirect("/"), request, record);
}
