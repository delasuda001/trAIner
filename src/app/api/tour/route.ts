import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/profiles/context";
import { apiAsMember } from "@/lib/profiles/request";
import { tourSeenKey } from "@/lib/tour/tour";

export const dynamic = "force-dynamic";

/** Visite guidée terminée ou passée : elle ne s'ouvre plus d'office pour ce profil (sur aucun appareil). */
export function POST() {
  return apiAsMember((member) => {
    getRegistry().setSetting(tourSeenKey(member.id), new Date().toISOString());
    return NextResponse.json({ ok: true });
  });
}
