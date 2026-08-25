import type { ManualSession, SyncedActivity } from "@/lib/db/types";
import { formatDuration, formatPace } from "@/lib/formatters";
import type { CalendarDisplayItem, DashboardPeriod } from "./types";

export function buildCalendarDisplayItems(running: SyncedActivity[], manual: ManualSession[]): CalendarDisplayItem[] {
  const runningItems = running.map((activity): CalendarDisplayItem => {
    const date = activity.startDate.slice(0, 10);
    const distanceKm = (activity.distanceM ?? 0) / 1000;
    const subtitle = `${distanceKm.toFixed(2).replace(".", ",")} km · ${formatDuration(activity.movingTimeS)}${activity.averageSpeedMps ? ` · ${formatPace(activity.averageSpeedMps)}` : ""}`;
    return { id: activity.intervalsActivityId, source: "running_sync", date, displayType: "Course", title: activity.name ?? "Course à pied", subtitle, href: `/activities/${encodeURIComponent(activity.intervalsActivityId)}`, volume: distanceKm, volumeUnit: "km", metadata: { distanceKm, durationMinutes: activity.movingTimeS == null ? undefined : Math.round(activity.movingTimeS / 60), sportType: activity.sportType } };
  });
  const manualItems = manual.map((session): CalendarDisplayItem => ({ id: session.id, source: "manual", date: session.sessionDate, displayType: session.discipline, title: session.label ?? manualLabel(session.discipline), subtitle: `${manualLabel(session.discipline)} · ${session.durationMinutes} min`, volume: session.durationMinutes, volumeUnit: "min", metadata: { discipline: session.discipline, durationMinutes: session.durationMinutes } }));
  return [...runningItems, ...manualItems].sort((left, right) => right.date.localeCompare(left.date) || left.source.localeCompare(right.source) || left.id.localeCompare(right.id));
}

export function calendarPeriod(date: string, view: "week" | "month"): DashboardPeriod {
  const current = parseDate(date);
  if (view === "week") { const monday = shift(current, mondayOffset(current)); return { view, start: toDate(monday), end: toDate(shift(monday, 6)) }; }
  const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
  const gridStart = shift(first, mondayOffset(first));
  const last = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0));
  const gridEnd = shift(last, 7 - last.getUTCDay());
  return { view, start: toDate(gridStart), end: toDate(gridEnd) };
}

function manualLabel(discipline: string): string { return { strength_training: "Musculation", swimming: "Natation", mobility: "Mobilité", other: "Autre" }[discipline] ?? "Autre"; }
function parseDate(value: string): Date { return new Date(`${value}T00:00:00Z`); }
function shift(date: Date, days: number): Date { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; }
function mondayOffset(date: Date): number { return date.getUTCDay() === 0 ? -6 : 1 - date.getUTCDay(); }
function toDate(date: Date): string { return date.toISOString().slice(0, 10); }