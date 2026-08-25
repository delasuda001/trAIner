import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import type { AppDatabase } from "@/lib/db/client";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { localDateSchema } from "@/lib/db/contracts";

const querySchema = z.object({ from: localDateSchema.optional(), to: localDateSchema.optional(), limit: z.coerce.number().int().min(1).max(100).default(100) });

export async function GET(request: Request) {
  return readLocalActivities(request, getDb());
}

export async function readLocalActivities(request: Request, database: AppDatabase) {
  const requestId = randomUUID();
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const from = `${query.from ?? "1970-01-01"}T00:00:00.000Z`;
    const to = `${query.to ?? "9999-12-31"}T23:59:59.999Z`;
    const activities = await createSyncedActivityRepository(database).findByPeriod(from, to, query.limit);
    return NextResponse.json(activities.map((activity) => ({ id: activity.intervalsActivityId, name: activity.name ?? "Course à pied", type: activity.sportType, start_date: activity.startDate, distance: activity.distanceM, moving_time: activity.movingTimeS, elapsed_time: activity.elapsedTimeS, average_speed: activity.averageSpeedMps, average_heartrate: activity.averageHeartRateBpm, average_cadence: activity.averageCadenceSpm, total_elevation_gain: activity.elevationGainM, icu_training_load: activity.trainingLoad })));
  }
  catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "INVALID_QUERY", message: "Les filtres de date ou la limite sont invalides", requestId } }, { status: 400 });
    console.error("[activities] local database error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: { code: "DATABASE_ERROR", message: "Le cache local est indisponible", requestId } }, { status: 500 });
  }
}