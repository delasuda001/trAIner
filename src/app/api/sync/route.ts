import { NextResponse } from "next/server";
import { SourceError } from "@/lib/source/types";
import { syncNow } from "@/lib/server/sync-service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await syncNow();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof SourceError || error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: `Synchronisation Garmin impossible : ${message}` }, { status: 502 });
  }
}
