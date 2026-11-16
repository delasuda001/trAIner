import { NextResponse } from "next/server";
import { apiAsMember } from "@/lib/profiles/request";
import { analyzeSession } from "@/lib/server/analytics";
import { generateSessionCoach, readSessionCoach } from "@/lib/server/coach-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "Séance introuvable ou sans données détaillées." };

export async function GET(_request: Request, { params }: Params) {
  const id = decodeURIComponent((await params).id);
  return apiAsMember(() => {
    const analysis = analyzeSession(id);
    return analysis ? NextResponse.json(readSessionCoach(analysis)) : NextResponse.json(NOT_FOUND, { status: 404 });
  });
}

/** Génère l'analyse (ou renvoie celle en cache si les données n'ont pas changé). */
export async function POST(_request: Request, { params }: Params) {
  const id = decodeURIComponent((await params).id);
  return apiAsMember(async () => {
    const analysis = analyzeSession(id);
    return analysis ? NextResponse.json(await generateSessionCoach(analysis)) : NextResponse.json(NOT_FOUND, { status: 404 });
  });
}
