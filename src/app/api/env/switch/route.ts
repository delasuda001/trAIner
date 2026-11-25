import { NextResponse } from "next/server";
import { isTestEnv, otherEnvOrigin } from "@/lib/env/environment";
import { createHandoffToken } from "@/lib/env/handoff";
import { apiAsAdmin } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

function requestHost(request: Request): string {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
}

/**
 * Bascule d'environnement (Bastien seul). Prod → test : jeton signé de 60 s, le test ouvre sa propre session.
 * Test → prod : simple retour, la session de prod est toujours là.
 */
export function GET(request: Request) {
  return apiAsAdmin((member) => {
    const host = requestHost(request);
    if (isTestEnv()) return NextResponse.redirect(`${otherEnvOrigin(host, "prod")}/`, 303);
    const secret = process.env.SILLAGE_ENV_SECRET ?? "";
    if (secret.length < 16) return NextResponse.json({ error: "Secret de bascule absent (SILLAGE_ENV_SECRET dans .env.local)." }, { status: 503 });
    const token = createHandoffToken(member.id, secret);
    return NextResponse.redirect(`${otherEnvOrigin(host, "test")}/api/session/handoff?t=${encodeURIComponent(token)}`, 303);
  });
}
