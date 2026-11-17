import { NextResponse } from "next/server";
import { apiAsMember } from "@/lib/profiles/request";
import { syncNow } from "@/lib/server/sync-service";

export const dynamic = "force-dynamic";

export function POST() {
  return apiAsMember(async (member) => {
    try {
      const result = await syncNow(member);
      return NextResponse.json({
        newActivities: result.newActivityIds.length,
        latestNewRunId: result.newRunIds[0] ?? null,
        detailsFetched: result.detailsFetched,
        detailsFailed: result.detailsFailed,
        pendingDetails: result.pendingDetails,
        totalActivities: result.totalActivities,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      // 424 et non 502 : un 502 signifie « Sillage injoignable » (relais du tunnel, Mac éteint) pour le mode hors ligne.
      return NextResponse.json({ error: `Synchronisation Garmin impossible : ${message}` }, { status: 424 });
    }
  });
}
