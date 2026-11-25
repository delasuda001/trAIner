import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/env/environment";

/**
 * Contrôle optimiste : sans cookie de session, renvoi vers /connexion (pages)
 * ou 401 (API). La vérification réelle (signature, version, profil actif) est
 * faite par chaque page et route via `asMember` / `apiAsMember`.
 */
const SESSION_COOKIE = sessionCookieName();
const PUBLIC_PATHS = ["/connexion", "/api/session", "/api/ping"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Session expirée : merci de vous reconnecter." }, { status: 401 });
  return NextResponse.redirect(new URL("/connexion", request.url));
}

export const config = {
  // Fichiers publics sans donnée : styles et scripts du build, icônes et manifeste (demandés sans cookie par iOS),
  // service worker et page hors ligne.
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|icons/|apple-icon|manifest\\.webmanifest|favicon\\.ico|sw\\.js|offline\\.html).*)"],
};
