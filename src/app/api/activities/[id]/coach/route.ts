import { NextResponse } from "next/server";
import { analyzeSession } from "@/lib/server/analytics";
import { generateSessionCoach, readSessionCoach } from "@/lib/server/coach-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const analysis = analyzeSession(decodeURIComponent((await params).id));
  if (!analysis) return NextResponse.json({ error: "Séance introuvable ou sans données détaillées." }, { status: 404 });
  return NextResponse.json(readSessionCoach(analysis));
}

/** Génère l'analyse (ou renvoie celle en cache si les données n'ont pas changé). */
export async function POST(_request: Request, { params }: Params) {
  const analysis = analyzeSession(decodeURIComponent((await params).id));
  if (!analysis) return NextResponse.json({ error: "Séance introuvable ou sans données détaillées." }, { status: 404 });
  return NextResponse.json(await generateSessionCoach(analysis));
}
