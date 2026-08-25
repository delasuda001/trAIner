export type CalendarSource = "running_sync" | "manual";
export type CalendarDisplayItem = {
  id: string;
  source: CalendarSource;
  date: string;
  displayType: string;
  title: string;
  subtitle: string;
  href?: string;
  volume: number;
  volumeUnit: "km" | "min";
  metadata: { discipline?: string; distanceKm?: number; durationMinutes?: number; sportType?: string };
};

export type WeeklyRunningVolume = { weekStart: string; weekEnd: string; label: string; distanceKm: number; runCount: number };
export type RunningDashboardSummary = { label: "Course uniquement"; periodStart: string; periodEnd: string; totalDistanceKm: number; runCount: number; averageRunsPerWeek: number; averageKmPerWeek: number; weeksWithAtLeastTwoRuns: number };
export type DashboardPeriod = { view: "week" | "month"; start: string; end: string };