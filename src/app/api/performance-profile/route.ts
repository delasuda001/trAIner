import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, type AppDatabase } from "@/lib/db/client";
import { buildPerformanceProfile } from "@/lib/analysis/performance-profile";

export async function GET() {
  return getPerformanceProfile(getDb());
}

export async function getPerformanceProfile(database: AppDatabase) {
  const requestId = randomUUID();
  try {
    const profile = await buildPerformanceProfile(database);
    return NextResponse.json(profile);
  } catch (error) {
    console.error("[performance-profile] GET error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: { code: "PROFILE_FAILED", message: "Le profil de performance n’a pas pu être calculé", requestId } }, { status: 500 });
  }
}
