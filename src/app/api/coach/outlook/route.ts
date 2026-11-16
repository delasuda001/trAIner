import { NextResponse } from "next/server";
import { apiAsMember } from "@/lib/profiles/request";
import { getDashboard } from "@/lib/server/analytics";
import { generateOutlookCoach } from "@/lib/server/coach-service";

export const dynamic = "force-dynamic";

export function POST() {
  return apiAsMember(async () => NextResponse.json(await generateOutlookCoach(getDashboard())));
}
