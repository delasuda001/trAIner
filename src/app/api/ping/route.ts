import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Sillage répond-il ? (testé par l'appareil pour passer en mode hors ligne ; aucune donnée) */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
