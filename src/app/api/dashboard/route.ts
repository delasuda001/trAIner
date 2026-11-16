import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/server/analytics";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getDashboard());
}
