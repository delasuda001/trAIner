import { NextResponse } from "next/server";
import { apiAsMember } from "@/lib/profiles/request";
import { loadContext } from "@/lib/server/analytics";

export const dynamic = "force-dynamic";

/** Nombre de séances récentes gardées sur l'appareil pour la consultation hors ligne. */
const OFFLINE_ACTIVITIES = 20;

/**
 * Pages à garder sur l'appareil pour la consultation hors ligne (Mac éteint).
 * Seules les séances dont les séries sont déjà en base : les préparer ne déclenche
 * aucun appel Garmin (et jamais Claude).
 */
export function GET() {
  return apiAsMember((member) => {
    const { rows } = loadContext();
    const activities = [...rows].reverse().filter((row) => row.detailStatus !== "pending").slice(0, OFFLINE_ACTIVITIES).map((row) => `/activities/${encodeURIComponent(row.id)}`);
    const pages = ["/", "/objectif", "/coach", "/parametres", ...(member.role === "guest" ? ["/bienvenue"] : [])];
    return NextResponse.json({ urls: [...pages, ...activities] }, { headers: { "Cache-Control": "no-store" } });
  });
}
