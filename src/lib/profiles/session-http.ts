import "server-only";

import { NextResponse } from "next/server";
import { createLoginThrottle, deviceLabel, generateToken, SESSION_COOKIE, SESSION_TTL_S } from "./credentials";
import { getRegistry } from "./context";
import type { MemberRecord } from "./types";

const globalForThrottle = globalThis as typeof globalThis & { sillageLoginThrottle?: ReturnType<typeof createLoginThrottle> };

/** Freinage commun à la connexion par code et aux liens d'invitation. */
export const loginThrottle = (globalForThrottle.sillageLoginThrottle ??= createLoginThrottle());

function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

/** Redirection relative : reste sur l'adresse publique quel que soit l'hôte vu par le serveur. */
export function relativeRedirect(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/** Ouvre une session sur cet appareil et pose le cookie (persistant, httpOnly, Secure en HTTPS). */
export function openSession(response: NextResponse, request: Request, record: MemberRecord): NextResponse {
  const token = generateToken();
  getRegistry().createSession(record.id, token, deviceLabel(request.headers.get("user-agent")));
  getRegistry().markLogin(record.id);
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isHttps(request), path: "/", maxAge: SESSION_TTL_S });
  return response;
}
