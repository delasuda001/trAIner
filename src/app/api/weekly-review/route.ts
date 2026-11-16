import { NextResponse } from "next/server";
import { z } from "zod";
import { localDate } from "@/lib/dates";
import { apiAsAdmin } from "@/lib/profiles/request";
import { getDashboard } from "@/lib/server/analytics";
import { generateWeeklyReview } from "@/lib/server/coach-service";
import { defaultReviewWeek } from "@/lib/server/weekly-dossier";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).nullable();

/** Génère le bilan d'une semaine (Opus), ou renvoie celui en cache si rien n'a changé. Réservé à Bastien. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Semaine invalide" }, { status: 400 });
  const weekStart = parsed.data?.weekStart ?? defaultReviewWeek(localDate());
  return apiAsAdmin(async () => NextResponse.json(await generateWeeklyReview(weekStart, getDashboard().profile.zones)));
}
