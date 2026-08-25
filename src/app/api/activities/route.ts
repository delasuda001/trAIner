import { NextResponse } from "next/server";
import { listRecentActivities } from "@/lib/intervals/client";

export async function GET() {
  try { return NextResponse.json(await listRecentActivities()); }
  catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const status = message === "RATE_LIMIT" ? 429 : message.startsWith("INTERVALS_4") ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}