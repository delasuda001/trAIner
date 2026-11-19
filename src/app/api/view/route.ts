import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { apiAsMember } from "@/lib/profiles/request";
import { VIEW_MODE_KEY, viewModeSchema } from "@/lib/view-mode";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ view: viewModeSchema });

/** Vue du tableau de bord du profil actif (chaque profil règle la sienne). */
export async function PUT(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Vue inconnue" }, { status: 400 });
  return apiAsMember(() => {
    createAppStateRepository().set(VIEW_MODE_KEY, parsed.data.view);
    return NextResponse.json(parsed.data);
  });
}
