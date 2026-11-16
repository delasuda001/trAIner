import { NextResponse } from "next/server";
import { apiAsMember } from "@/lib/profiles/request";
import { getDashboard } from "@/lib/server/analytics";

export const dynamic = "force-dynamic";

export function GET() {
  return apiAsMember(() => NextResponse.json(getDashboard()));
}
