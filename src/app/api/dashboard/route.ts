import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { localDateSchema } from "@/lib/db/contracts";
import { createManualSessionRepository } from "@/lib/db/repositories/manual-session-repository";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { buildCalendarDisplayItems, calendarPeriod } from "@/lib/dashboard/calendar";
import { buildRunningDashboardSummary, buildWeeklyRunningVolume } from "@/lib/dashboard/volume";

const querySchema = z.object({ date: localDateSchema.optional(), view: z.enum(["week", "month"]).default("week") }).strict();

export async function GET(request: Request) {
  return getDashboard(request, getDb());
}

export async function getDashboard(request: Request, database = getDb()) {
  const requestId = randomUUID();
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const date = query.date ?? new Date().toISOString().slice(0, 10);
    const period = calendarPeriod(date, query.view);
    const runningRepository = createSyncedActivityRepository(database);
    const manualRepository = createManualSessionRepository(database);
    const [running, manual, volumeActivities] = await Promise.all([
      runningRepository.findByPeriod(`${period.start}T00:00:00.000Z`, `${period.end}T23:59:59.999Z`),
      manualRepository.findByPeriod(period.start, period.end),
      runningRepository.findByPeriod(`${buildWeeklyRunningVolume([], date)[0]?.weekStart ?? period.start}T00:00:00.000Z`, `${date}T23:59:59.999Z`),
    ]);
    const weeklyRunningVolume12Weeks = buildWeeklyRunningVolume(volumeActivities, date);
    const volumeStart = weeklyRunningVolume12Weeks[0]?.weekStart ?? date;
    return NextResponse.json({ requestId, period, calendarItems: buildCalendarDisplayItems(running, manual), runningSummary12Weeks: buildRunningDashboardSummary(weeklyRunningVolume12Weeks, volumeStart, date), weeklyRunningVolume12Weeks });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "La date ou la vue demandée est invalide", requestId } }, { status: 400 });
    console.error("[dashboard] error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: { code: "DATABASE_ERROR", message: "Le dashboard est indisponible", requestId } }, { status: 500 });
  }
}