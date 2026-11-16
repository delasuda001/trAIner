import { NextResponse } from "next/server";
import { apiAsAdmin } from "@/lib/profiles/request";
import { generateSynthesis } from "@/lib/server/feedback-service";

export const dynamic = "force-dynamic";

/** Synthèse des retours par Claude, à la demande de Bastien. */
export function POST() {
  return apiAsAdmin(async () => NextResponse.json(await generateSynthesis()));
}
