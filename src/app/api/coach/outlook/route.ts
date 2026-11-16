import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/server/analytics";
import { generateOutlookCoach } from "@/lib/server/coach-service";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(await generateOutlookCoach(getDashboard()));
}
