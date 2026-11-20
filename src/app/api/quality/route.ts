import { NextResponse } from "next/server";
import { z } from "zod";
import { getRegistry } from "@/lib/profiles/context";
import { apiAsAdmin } from "@/lib/profiles/request";
import { runQualityAudit } from "@/lib/server/quality-audit";
import { reviewIsRunning, startQualityReview } from "@/lib/server/quality-review-service";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("review") }),
  z.object({ action: z.literal("dismiss"), id: z.string().min(1).max(100) }),
]);

/** Contrôle de cohérence : relancer l'audit (sans appel à Claude), lancer la relecture IA par lots, ou écarter un constat. Réservé à Bastien. */
export function POST(request: Request) {
  return apiAsAdmin(async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    if (parsed.data.action === "review") {
      // Relecture IA par lots (Haiku), en arrière-plan, dans les plafonds du travail automatique.
      return NextResponse.json({ started: startQualityReview(), running: reviewIsRunning() });
    }
    if (parsed.data.action === "dismiss") {
      getRegistry().dismissQualityFinding(parsed.data.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(runQualityAudit());
  });
}
