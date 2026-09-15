import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { manualSessions, schema, syncedActivities } from "@/lib/db/schema";
import type { AppDatabase, } from "@/lib/db/client";
import { buildCalendarDisplayItems, calendarPeriod } from "./calendar";
import { buildRunningDashboardSummary, buildWeeklyRunningVolume } from "./volume";
import { getDashboard } from "@/app/api/dashboard/route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const now = "2026-08-25T12:00:00.000Z";
const running = { id: "sync-1", intervalsActivityId: "i-run-1", startDate: "2026-08-25T10:00:00.000Z", timezone: null, name: "Sortie", sportType: "Run", distanceM: 5000, movingTimeS: 1500, elapsedTimeS: 1500, elevationGainM: null, averageSpeedMps: 3.33, averageHeartRateBpm: null, maxHeartRateBpm: null, averageCadenceSpm: null, averagePowerW: null, trainingLoad: null, sourceUpdatedAt: null, syncedAt: now, createdAt: now, updatedAt: now };
const manual = { id: "manual-1", sessionDate: "2026-08-25", discipline: "swimming", durationMinutes: 60, label: "Piscine", note: null, createdAt: now, updatedAt: now };

beforeEach(() => { sqlite = new Database(":memory:"); applyMigrations(sqlite); database = drizzle(sqlite, { schema }); });
afterEach(() => sqlite.close());

describe("dashboard", () => {
  it("convertit les deux sources uniquement dans CalendarDisplayItem", () => {
    const items = buildCalendarDisplayItems([running], [manual]);
    expect(items.find((item) => item.source === "running_sync")).toMatchObject({ date: "2026-08-25", href: "/activities/i-run-1", volumeUnit: "km" });
    expect(items.find((item) => item.source === "manual")).toMatchObject({ date: "2026-08-25", volumeUnit: "min" });
    expect(JSON.stringify(items)).not.toMatch(/latitude|longitude|polyline|gps/i);
  });

  it("produit exactement 12 semaines, lundi-dimanche, avec les semaines vides", () => {
    const volume = buildWeeklyRunningVolume([running], "2026-08-25");
    expect(volume).toHaveLength(12);
    expect(volume[0]).toMatchObject({ weekStart: "2026-06-08", weekEnd: "2026-06-14", distanceKm: 0, runCount: 0 });
    expect(volume.at(-1)).toMatchObject({ weekStart: "2026-08-24", weekEnd: "2026-08-30", distanceKm: 5, runCount: 1 });
    expect(buildWeeklyRunningVolume([], "2026-08-25").every((week) => week.distanceKm === 0)).toBe(true);
  });

  it("exclut les séances manuelles de la synthèse", () => {
    const volume = buildWeeklyRunningVolume([running], "2026-08-25");
    const summary = buildRunningDashboardSummary(volume, "2026-06-08", "2026-08-30");
    expect(summary).toMatchObject({ totalDistanceKm: 5, runCount: 1, label: "Course uniquement" });
  });

  it("calcule les périodes semaine et mois", () => {
    expect(calendarPeriod("2026-08-25", "week")).toMatchObject({ start: "2026-08-24", end: "2026-08-30" });
    expect(calendarPeriod("2026-08-25", "month")).toMatchObject({ start: "2026-07-27", end: "2026-09-06" });
  });

  it("retourne une réponse vide et garde le manuel uniquement dans le calendrier", async () => {
    await database.insert(syncedActivities).values(running);
    await database.insert(manualSessions).values(manual);
    const response = await getDashboard(new Request("http://localhost/api/dashboard?date=2026-08-25&view=week"), database);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.calendarItems).toHaveLength(2);
    expect(payload.weeklyRunningVolume12Weeks.at(-1)).toMatchObject({ distanceKm: 5, runCount: 1 });
    expect(payload.runningSummary12Weeks.totalDistanceKm).toBe(5);
    expect(getDashboard(new Request("http://localhost/api/dashboard?date=bad"), database)).resolves.toHaveProperty("status", 400);
    expect(getDashboard(new Request("http://localhost/api/dashboard?view=year"), database)).resolves.toHaveProperty("status", 400);
  });
});