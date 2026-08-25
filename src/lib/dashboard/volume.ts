import type { SyncedActivity } from "@/lib/db/types";
import type { RunningDashboardSummary, WeeklyRunningVolume } from "./types";

export function buildWeeklyRunningVolume(activities: SyncedActivity[], referenceDate: string, weeks = 12): WeeklyRunningVolume[] {
  const reference = parseDate(referenceDate);
  const currentMonday = shift(reference, reference.getUTCDay() === 0 ? -6 : 1 - reference.getUTCDay());
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = shift(currentMonday, (index - weeks + 1) * 7);
    const weekEnd = shift(weekStart, 6);
    const start = toDate(weekStart); const end = toDate(weekEnd);
    const matching = activities.filter((activity) => { const date = activity.startDate.slice(0, 10); return date >= start && date <= end; });
    return { weekStart: start, weekEnd: end, label: `${weekStart.getUTCDate()} ${weekStart.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}`, distanceKm: round(matching.reduce((total, activity) => total + (activity.distanceM ?? 0), 0) / 1000), runCount: matching.length };
  });
}

export function buildRunningDashboardSummary(volume: WeeklyRunningVolume[], periodStart: string, periodEnd: string): RunningDashboardSummary {
  const totalDistanceKm = round(volume.reduce((total, week) => total + week.distanceKm, 0));
  const runCount = volume.reduce((total, week) => total + week.runCount, 0);
  return { label: "Course uniquement", periodStart, periodEnd, totalDistanceKm, runCount, averageRunsPerWeek: round(runCount / volume.length), averageKmPerWeek: round(totalDistanceKm / volume.length), weeksWithAtLeastTwoRuns: volume.filter((week) => week.runCount >= 2).length };
}

function parseDate(value: string): Date { return new Date(`${value}T00:00:00Z`); }
function shift(date: Date, days: number): Date { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; }
function toDate(date: Date): string { return date.toISOString().slice(0, 10); }
function round(value: number): number { return Math.round(value * 100) / 100; }