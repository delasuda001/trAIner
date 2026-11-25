import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/env/environment";

/**
 * Contrôle optimiste : sans cookie de session, renvoi vers /connexion (pages)
 * ou 401 (API). La vérification réelle (signature, version, profil actif) est
 * faite par chaque page et route via `asMember` / `apiAsMember`.
 */
const SESSION_COOKIE = sessionCookieName();
const PUBLIC_PATHS = ["/connexion", "/api/session", "/api/ping"];
/** « Voir comme » (Bastien regarde l'espace d'un invité) : lecture seule, sauf pour en sortir. */
const VIEW_AS_COOKIE = sessionCookieName() === "sillage_session" ? "sillage_view_as" : "sillage_test_view_as";
const VIEW_AS_ALLOWED = ["/api/view-as", "/api/session", "/api/env"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value) {
    const readOnly = request.cookies.get(VIEW_AS_COOKIE)?.value && pathname.startsWith("/api/") && request.method !== "GET" && request.method !== "HEAD" && !VIEW_AS_ALLOWED.some((path) => pathname.startsWith(path));
    if (readOnly) return NextResponse.json({ error: "Lecture seule : tu regardes l'espace d'un invité. Reviens à ton compte pour agir." }, { status: 403 });
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Session expirée : merci de vous reconnecter." }, { status: 401 });
  return NextResponse.redirect(new URL("/connexion", request.url));
}

export const config = {
  // Fichiers publics sans donnée : styles et scripts du build, icônes et manifeste (demandés sans cookie par iOS),
  // service worker et page hors ligne.
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|icons/|apple-icon|manifest\\.webmanifest|favicon\\.ico|sw\\.js|offline\\.html).*)"],
};
