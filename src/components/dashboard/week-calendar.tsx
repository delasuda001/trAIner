import type { CalendarDisplayItem, DashboardPeriod } from "@/lib/dashboard/types";
import { CalendarActivityItem } from "./calendar-activity-item";

export function WeekCalendar({ period, items }: { period: DashboardPeriod; items: CalendarDisplayItem[] }) {
  return <div className="calendar-grid week-grid">{Array.from({ length: 7 }, (_, index) => { const date = addDays(period.start, index); const dayItems = items.filter((item) => item.date === date); return <div className="calendar-day" key={date}><div className="day-heading"><small>{new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" })}</small><strong>{date.slice(8)}</strong></div><div className="day-items">{dayItems.length ? dayItems.map((item) => <CalendarActivityItem item={item} key={`${item.source}-${item.id}`} />) : <span className="day-empty">·</span>}</div></div>; })}</div>;
}
function addDays(date: string, days: number): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }