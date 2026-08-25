import type { CalendarDisplayItem, DashboardPeriod } from "@/lib/dashboard/types";
import { CalendarActivityItem } from "./calendar-activity-item";

export function MonthCalendar({ period, items, selectedDate }: { period: DashboardPeriod; items: CalendarDisplayItem[]; selectedDate: string }) {
  const month = selectedDate.slice(0, 7);
  const days = Array.from({ length: 42 }, (_, index) => addDays(period.start, index));
  return <div className="calendar-grid month-grid">{days.map((date) => { const dayItems = items.filter((item) => item.date === date); return <div className={`calendar-day month-day ${date.slice(0, 7) === month ? "" : "outside-month"}`} key={date}><div className="day-heading"><small>{date.slice(8)}</small></div><div className="day-items">{dayItems.slice(0, 3).map((item) => <CalendarActivityItem item={item} key={`${item.source}-${item.id}`} />)}{dayItems.length > 3 && <span className="more-items">+{dayItems.length - 3} autres</span>}</div></div>; })}</div>;
}
function addDays(date: string, days: number): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }